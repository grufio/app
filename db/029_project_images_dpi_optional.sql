-- gruf.io - Make project_images.dpi optional (output-only)
--
-- Goal:
-- - DPI must not be required for editor geometry (pixel-only editor)
-- - Allow uploads/seeding without a DPI value

alter table public.project_images
  drop constraint if exists project_images_dpi_gt_zero;

alter table public.project_images
  alter column dpi drop not null;

