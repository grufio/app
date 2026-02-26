-- Migration: Cascade delete for derived images
-- Purpose: When a master image is deleted, automatically delete all derived images (filters, crops)
--
-- Changes:
-- - Modify source_image_id foreign key constraint to ON DELETE CASCADE
-- - This allows deleting master images and automatically cleans up all derived assets

alter table public.project_images
  drop constraint if exists project_images_source_image_id_fkey;

alter table public.project_images
  add constraint project_images_source_image_id_fkey
  foreign key (source_image_id)
  references public.project_images(id)
  on delete cascade;
