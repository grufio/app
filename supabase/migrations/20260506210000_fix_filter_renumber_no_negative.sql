-- Fix: stack_order check constraint violation in filter renumber.
--
-- `project_image_filters.stack_order` has `check (stack_order > 0)`. The
-- previous renumber strategy in `reorder_project_image_filters` and
-- `remove_project_image_filter` used a 2-phase trick: phase 1 wrote
-- negative values to dodge the unique (project_id, stack_order) constraint,
-- phase 2 wrote the final positive values. The check constraint is not
-- deferrable, so phase 1 immediately threw 23514:
--
--   new row for relation "project_image_filters" violates check
--   constraint "project_image_filters_stack_order_check"
--
-- Triggered by every "Remove filter" click in production.
--
-- Root fix: ascending iteration during compaction never assigns a target
-- value larger than any source value still pending in the loop, so the
-- unique constraint cannot collide. The negative-temp dance was unneeded.
-- Drop it. Single positive pass, with `is distinct from` guard to skip
-- no-op writes.

create or replace function public.reorder_project_image_filters(
  p_project_id uuid
)
returns void
language plpgsql
as $$
declare
  v_row record;
  v_next integer := 1;
begin
  perform pg_advisory_xact_lock(hashtext(p_project_id::text));

  for v_row in
    select id, stack_order
    from public.project_image_filters
    where project_id = p_project_id
    order by stack_order asc, created_at asc, id asc
  loop
    if v_row.stack_order is distinct from v_next then
      update public.project_image_filters
         set stack_order = v_next
       where id = v_row.id;
    end if;
    v_next := v_next + 1;
  end loop;
end;
$$;

create or replace function public.remove_project_image_filter(
  p_project_id uuid,
  p_filter_id uuid,
  p_rewires jsonb default '[]'::jsonb
)
returns void
language plpgsql
as $$
declare
  v_target_project uuid;
  v_rewire jsonb;
  v_filter_id uuid;
  v_input uuid;
  v_output uuid;
  v_row record;
  v_next integer := 1;
begin
  perform pg_advisory_xact_lock(hashtext(p_project_id::text));

  select project_id
    into v_target_project
  from public.project_image_filters
  where id = p_filter_id;

  if v_target_project is null then
    raise exception 'filter not found' using errcode = 'P0002';
  end if;

  if v_target_project is distinct from p_project_id then
    raise exception 'filter does not belong to project' using errcode = '23503';
  end if;

  for v_rewire in select * from jsonb_array_elements(coalesce(p_rewires, '[]'::jsonb))
  loop
    v_filter_id := (v_rewire ->> 'id')::uuid;
    v_input := (v_rewire ->> 'input_image_id')::uuid;
    v_output := (v_rewire ->> 'output_image_id')::uuid;

    update public.project_image_filters
       set input_image_id = v_input,
           output_image_id = v_output
     where id = v_filter_id
       and project_id = p_project_id;

    if not found then
      raise exception 'rewire target filter % not found in project', v_filter_id
        using errcode = 'P0002';
    end if;
  end loop;

  delete from public.project_image_filters
   where id = p_filter_id
     and project_id = p_project_id;

  for v_row in
    select id, stack_order
    from public.project_image_filters
    where project_id = p_project_id
    order by stack_order asc, created_at asc, id asc
  loop
    if v_row.stack_order is distinct from v_next then
      update public.project_image_filters
         set stack_order = v_next
       where id = v_row.id;
    end if;
    v_next := v_next + 1;
  end loop;
end;
$$;
