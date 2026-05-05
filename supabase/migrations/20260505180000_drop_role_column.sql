-- Phase 4d of role -> kind migration. Final step: drop the role column and everything
-- that still depended on it.
--
-- Pre-conditions (verified by phases 4a/4b/4c):
--   - All app reads route through resolveImageKind, which prefers kind and only falls
--     back to role for legacy rows. Backfill ran via db/054 so kind is populated.
--   - Kind-based parallel indexes/constraints exist (db/055 + 20260505160000).
--   - The master-immutability trigger and the non-master-delete policy key on kind
--     (20260505170000).
-- After this migration role is no longer referenced anywhere in the schema.

drop index if exists public.project_images_one_active_master_idx;
drop index if exists public.project_images_one_active_image_idx;
drop index if exists public.project_images_one_master_per_project_idx;
drop index if exists public.project_images_master_list_active_idx;
drop index if exists public.project_images_project_id_role_created_at_idx;

alter table public.project_images
  drop constraint if exists project_images_master_no_source_ck;
alter table public.project_images
  drop constraint if exists project_images_asset_requires_source_ck;

alter table public.project_images drop column if exists role;

-- Note: the public.image_role enum type is intentionally kept because
-- project_image_state.role still uses it (different concept — tracks state
-- slot rather than image kind).

-- Restore the project-wide single-active-image invariant after the role-based
-- variant is gone (the kind-based active uniques are partitioned by kind, so
-- we still want a global "at most one active image per project").
create unique index if not exists project_images_one_active_image_idx
  on public.project_images (project_id)
  where is_active is true and deleted_at is null;
