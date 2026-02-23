-- gruf.io - Persisted lock state for project images
--
-- Purpose:
-- - Persist the editor lock/unlock state per image in DB.
-- - Enable consistent lock behavior across sessions/devices.

alter table public.project_images
  add column if not exists is_locked boolean not null default false;

