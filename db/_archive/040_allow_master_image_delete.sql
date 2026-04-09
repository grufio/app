-- Migration: Allow master image deletion
-- Purpose: Remove the DELETE block from guard_master_immutable trigger
--
-- Background:
-- The original trigger prevented deletion of master images to enforce immutability.
-- Now we want to allow deletion with proper cascade cleanup of derived images.
--
-- Changes:
-- - Modify guard_master_immutable() to only guard UPDATE operations
-- - Keep UPDATE guards for critical fields (storage_path, format, dimensions, etc.)
-- - Remove DELETE block entirely

create or replace function public.guard_master_immutable()
returns trigger
language plpgsql
as $$
begin
  -- Allow DELETE operations (cascade cleanup will handle derived images)
  if tg_op = 'DELETE' then
    return old;
  end if;

  -- Guard UPDATE: prevent mutation of critical master image fields
  if tg_op = 'UPDATE' and old.role = 'master' then
    if new.format is distinct from old.format
       or new.width_px is distinct from old.width_px
       or new.height_px is distinct from old.height_px
       or new.storage_bucket is distinct from old.storage_bucket
       or new.storage_path is distinct from old.storage_path
       or new.file_size_bytes is distinct from old.file_size_bytes
       or new.source_image_id is distinct from old.source_image_id
       or new.crop_rect_px is distinct from old.crop_rect_px
       or new.role is distinct from old.role
       or new.deleted_at is distinct from old.deleted_at then
      raise exception using
        message = 'master image core fields are immutable',
        detail = format('project_id=%s image_id=%s', old.project_id, old.id),
        hint = 'Create a new derived image (role=asset) instead.';
    end if;
  end if;

  return new;
end;
$$;

alter function public.guard_master_immutable()
  set search_path = public, pg_temp;
