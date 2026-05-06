-- Filter chain bug-fix bundle (bug/filter):
--   1. Adds the previously phantom `reorder_project_image_filters` RPC.
--   2. Adds an atomic `remove_project_image_filter` RPC that takes the
--      pre-built downstream rewires and performs UPDATE + DELETE +
--      stack_order reset under one advisory lock — replacing the 3-step
--      non-atomic flow in services/editor/server/filter-variants.ts.
--   3. Adds `is_hidden boolean NOT NULL DEFAULT false` on
--      project_image_filters so the show/hide toggle in the filter
--      sidebar persists across reloads.

alter table public.project_image_filters
  add column if not exists is_hidden boolean not null default false;

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

  -- Two-phase reorder so we never collide with the
  -- UNIQUE(project_id, stack_order) constraint mid-renumber: park each
  -- row on a negative slot first, then assign the final 1..N.
  for v_row in
    select id
    from public.project_image_filters
    where project_id = p_project_id
    order by stack_order asc, created_at asc, id asc
  loop
    update public.project_image_filters
       set stack_order = -v_next
     where id = v_row.id;
    v_next := v_next + 1;
  end loop;

  v_next := 1;
  for v_row in
    select id
    from public.project_image_filters
    where project_id = p_project_id
    order by stack_order desc -- negative values, smallest abs first
  loop
    update public.project_image_filters
       set stack_order = v_next
     where id = v_row.id;
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

  -- 1) Rewire downstream filters to the freshly-rebuilt outputs the caller
  --    has already created and uploaded. Each rewire is
  --    { id, input_image_id, output_image_id }.
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

  -- 2) Delete the target filter row.
  delete from public.project_image_filters
   where id = p_filter_id
     and project_id = p_project_id;

  -- 3) Compact stack_order to 1..N. Inlined two-phase renumber to keep
  --    everything inside the advisory lock acquired above.
  for v_row in
    select id
    from public.project_image_filters
    where project_id = p_project_id
    order by stack_order asc, created_at asc, id asc
  loop
    update public.project_image_filters
       set stack_order = -v_next
     where id = v_row.id;
    v_next := v_next + 1;
  end loop;

  v_next := 1;
  for v_row in
    select id
    from public.project_image_filters
    where project_id = p_project_id
    order by stack_order desc
  loop
    update public.project_image_filters
       set stack_order = v_next
     where id = v_row.id;
    v_next := v_next + 1;
  end loop;
end;
$$;
