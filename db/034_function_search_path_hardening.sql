-- gruf.io - Harden function search_path for security lint 0011
--
-- Purpose:
-- - Prevent mutable role-dependent name resolution inside SQL/plpgsql functions.
-- - Keep behavior unchanged; only pin schema lookup path.

alter function public.set_active_image(uuid, uuid)
  set search_path = public, pg_temp;

alter function public.set_active_master_image(uuid, uuid)
  set search_path = public, pg_temp;

alter function public.set_active_master_latest(uuid)
  set search_path = public, pg_temp;

alter function public.set_active_master_with_state(uuid, uuid, integer, integer)
  set search_path = public, pg_temp;

alter function public.project_workspace_sync_px_cache()
  set search_path = public, pg_temp;

