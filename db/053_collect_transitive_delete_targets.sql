-- Collect transitive delete targets for a project image root.
--
-- Returns the root image plus all descendants via source_image_id lineage.
-- Used by API routes to perform storage cleanup without JS graph traversal.

create or replace function public.collect_project_image_delete_targets(
  p_project_id uuid,
  p_root_image_id uuid
)
returns table (
  id uuid,
  storage_bucket text,
  storage_path text
)
language sql
stable
as $$
  with recursive lineage as (
    select pi.id
    from public.project_images pi
    where pi.project_id = p_project_id
      and pi.id = p_root_image_id
      and pi.deleted_at is null

    union all

    select child.id
    from public.project_images child
    join lineage parent on child.source_image_id = parent.id
    where child.project_id = p_project_id
      and child.deleted_at is null
  )
  select pi.id, pi.storage_bucket, pi.storage_path
  from public.project_images pi
  join lineage l on l.id = pi.id
  where pi.project_id = p_project_id
    and pi.deleted_at is null;
$$;

alter function public.collect_project_image_delete_targets(uuid, uuid)
  set search_path = public, pg_temp;
