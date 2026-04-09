-- gruf.io - Harden active-image mutation functions
--
-- Goal:
-- - Ensure active-image switch fails loudly for invalid targets.
-- - Keep exactly one active non-deleted image per project.
-- - Pin function search_path for security linting.

create or replace function public.set_active_image(
  p_project_id uuid,
  p_image_id uuid
)
returns void
language plpgsql
as $$
declare
  v_target_exists boolean;
begin
  select exists (
    select 1
    from public.project_images pi
    where pi.id = p_image_id
      and pi.project_id = p_project_id
      and pi.deleted_at is null
  )
  into v_target_exists;

  if not v_target_exists then
    raise exception using
      message = 'set_active_image target not found',
      detail = format('project_id=%s image_id=%s', p_project_id, p_image_id),
      hint = 'Ensure the image belongs to the project and is not deleted.';
  end if;

  update public.project_images
  set is_active = false
  where project_id = p_project_id
    and deleted_at is null;

  update public.project_images
  set is_active = true
  where id = p_image_id
    and project_id = p_project_id
    and deleted_at is null;
end;
$$;

alter function public.set_active_image(uuid, uuid)
  set search_path = public, pg_temp;

-- Keep compatibility wrappers aligned with the hardened behavior.
create or replace function public.set_active_master_image(p_project_id uuid, p_image_id uuid)
returns void
language plpgsql
as $$
begin
  perform public.set_active_image(p_project_id, p_image_id);
end;
$$;

alter function public.set_active_master_image(uuid, uuid)
  set search_path = public, pg_temp;

