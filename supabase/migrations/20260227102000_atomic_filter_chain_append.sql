-- Atomically append one filter row to a project's chain with tip-append invariants.
-- Matches db/050_atomic_filter_chain_append.sql.

create or replace function public.append_project_image_filter(
  p_project_id uuid,
  p_input_image_id uuid,
  p_output_image_id uuid,
  p_filter_type text,
  p_filter_params jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_last_output uuid;
  v_next_order integer;
  v_inserted_id uuid;
  v_input_project_id uuid;
  v_output_project_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_project_id::text));

  select project_id
    into v_input_project_id
  from public.project_images
  where id = p_input_image_id
    and deleted_at is null;

  if v_input_project_id is distinct from p_project_id then
    raise exception 'input_image_id is not part of project'
      using errcode = '23503';
  end if;

  select project_id
    into v_output_project_id
  from public.project_images
  where id = p_output_image_id
    and deleted_at is null;

  if v_output_project_id is distinct from p_project_id then
    raise exception 'output_image_id is not part of project'
      using errcode = '23503';
  end if;

  select f.output_image_id
    into v_last_output
  from public.project_image_filters f
  where f.project_id = p_project_id
  order by f.stack_order desc
  limit 1;

  if v_last_output is not null and v_last_output <> p_input_image_id then
    raise exception 'filter chain tip mismatch'
      using errcode = '23514';
  end if;

  select coalesce(max(stack_order), 0) + 1
    into v_next_order
  from public.project_image_filters
  where project_id = p_project_id;

  insert into public.project_image_filters (
    project_id,
    input_image_id,
    output_image_id,
    filter_type,
    filter_params,
    stack_order
  ) values (
    p_project_id,
    p_input_image_id,
    p_output_image_id,
    p_filter_type,
    coalesce(p_filter_params, '{}'::jsonb),
    v_next_order
  )
  returning id into v_inserted_id;

  return v_inserted_id;
end;
$$;
