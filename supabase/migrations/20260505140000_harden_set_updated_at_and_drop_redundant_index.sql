-- Phase 1 of db-review cleanup.
--
-- 1. Harden set_updated_at() with the same search_path as every other function in this
--    schema (set later via db/034_function_search_path_hardening). Prevents schema-spoofing
--    when called from triggers fired by sessions with non-default search_path.
-- 2. Drop project_image_state_role_idx — the (project_id, role) primary key already
--    covers any single-column or prefix lookup on this table, so the secondary index
--    is pure overhead.

alter function public.set_updated_at() set search_path = public, pg_temp;

drop index if exists public.project_image_state_role_idx;
