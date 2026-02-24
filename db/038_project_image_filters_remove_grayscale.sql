-- gruf.io - Purge all project image filters and disable filter types
--
-- Goal:
-- - Remove all persisted filter stack rows (legacy and current).
-- - Switch active image back to the pre-filter source for each affected project.
-- - Remove derived output image rows that were produced by filter steps.
-- - Disable new filter rows at DB level (no filter types allowed).

do $$
declare
  p record;
  v_base_image_id uuid;
  v_output_ids uuid[];
begin
  for p in
    select
      project_id,
      min(stack_order) as first_order
    from public.project_image_filters
    group by project_id
  loop
    select f.input_image_id
      into v_base_image_id
    from public.project_image_filters f
    where f.project_id = p.project_id
      and f.stack_order = p.first_order
    order by f.created_at, f.id
    limit 1;

    select coalesce(array_agg(output_image_id), array[]::uuid[])
      into v_output_ids
    from public.project_image_filters
    where project_id = p.project_id;

    delete from public.project_image_filters
    where project_id = p.project_id;

    if v_base_image_id is not null then
      perform public.set_active_image(p.project_id, v_base_image_id);
    end if;

    delete from public.project_images
    where id = any(v_output_ids)
      and role <> 'master';
  end loop;
end
$$;

alter table public.project_image_filters
  drop constraint if exists project_image_filters_filter_type_ck;

alter table public.project_image_filters
  drop constraint if exists project_image_filters_disabled_ck;

alter table public.project_image_filters
  add constraint project_image_filters_disabled_ck
  check (false);