-- gruf.io - Remove legacy grayscale filter rows and forbid reintroduction
--
-- Goal:
-- - Purge persisted grayscale filter rows (legacy) from project stacks.
-- - Keep remaining stack consistent and ordered.
-- - Remove derived image rows produced by deleted filter steps.
-- - Enforce allowed filter types at DB level.

do $$
declare
  p record;
  v_target_image_id uuid;
  v_doomed_output_ids uuid[];
begin
  -- Normalize values before applying a strict allow-list constraint.
  update public.project_image_filters
  set filter_type = lower(trim(filter_type))
  where filter_type is not null
    and filter_type <> lower(trim(filter_type));

  for p in
    with first_gray as (
      select
        project_id,
        min(stack_order) as first_gray_order
      from public.project_image_filters
      where lower(filter_type) = 'grayscale'
      group by project_id
    )
    select
      fg.project_id,
      fg.first_gray_order,
      (
        select f.input_image_id
        from public.project_image_filters f
        where f.project_id = fg.project_id
          and f.stack_order = fg.first_gray_order
        order by f.created_at, f.id
        limit 1
      ) as gray_input_image_id,
      (
        select f.output_image_id
        from public.project_image_filters f
        where f.project_id = fg.project_id
          and f.stack_order = fg.first_gray_order - 1
        order by f.created_at desc, f.id desc
        limit 1
      ) as previous_output_image_id
    from first_gray fg
  loop
    -- Purge grayscale and every dependent step after it to keep chain integrity.
    select coalesce(array_agg(output_image_id), array[]::uuid[])
      into v_doomed_output_ids
    from public.project_image_filters
    where project_id = p.project_id
      and stack_order >= p.first_gray_order;

    delete from public.project_image_filters
    where project_id = p.project_id
      and stack_order >= p.first_gray_order;

    -- Keep active image on the last valid remaining output, or fallback to the pre-grayscale input.
    v_target_image_id := coalesce(p.previous_output_image_id, p.gray_input_image_id);
    if v_target_image_id is not null then
      perform public.set_active_image(p.project_id, v_target_image_id);
    end if;

    -- Remove derived images created by deleted filter steps (master rows are never deleted).
    delete from public.project_images
    where id = any(v_doomed_output_ids)
      and role <> 'master';

    -- Re-pack stack order to be contiguous 1..n.
    with ordered as (
      select
        id,
        row_number() over (order by stack_order, created_at, id) as next_order
      from public.project_image_filters
      where project_id = p.project_id
    )
    update public.project_image_filters pf
    set stack_order = o.next_order
    from ordered o
    where pf.id = o.id
      and pf.stack_order <> o.next_order;
  end loop;
end
$$;

alter table public.project_image_filters
  drop constraint if exists project_image_filters_filter_type_ck;

alter table public.project_image_filters
  add constraint project_image_filters_filter_type_ck
  check (lower(filter_type) in ('invert', 'blur', 'brightness'));
