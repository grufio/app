-- Phase 4b of role -> kind migration. Additive only.
--
-- Add kind-based equivalents of the existing role-based partial indexes and
-- check constraints. The role-based originals stay in place for now; phase 4d
-- will drop them together with the role column itself, once app writes have
-- switched off role too.

-- Equivalent of project_images_master_list_active_idx but keyed on kind.
-- (project_images_active_master_kind_uidx already exists from db/055.)
create index if not exists project_images_master_list_active_kind_idx
  on public.project_images (project_id, created_at desc)
  where kind = 'master' and deleted_at is null;

-- Master kind cannot have a source_image_id set.
alter table public.project_images
  drop constraint if exists project_images_master_no_source_kind_ck;
alter table public.project_images
  add constraint project_images_master_no_source_kind_ck
  check (kind <> 'master' or source_image_id is null);

-- Every non-master kind must have a source_image_id (working_copy → master,
-- filter_working_copy → working_copy or another filter_working_copy).
alter table public.project_images
  drop constraint if exists project_images_non_master_requires_source_kind_ck;
alter table public.project_images
  add constraint project_images_non_master_requires_source_kind_ck
  check (kind = 'master' or source_image_id is not null) not valid;
