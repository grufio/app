-- PR-5: Konsolidiere DPI auf project_images, entferne write-only/ungenutzte Spalten.
--
-- Befund (App-Code-Grep):
--   - dpi_x, dpi_y: write-only in insert-master.ts; nirgends gelesen.
--     Code nutzt durchgängig nur das Skalar dpi.
--   - bit_depth: write-only via Form-Field (default "8"), nirgends gelesen.
--   - color_space: nirgends im App-Code referenziert.
--
-- Code-Side wurde im selben PR gestripped (insert-master, master-image-upload,
-- master-insert-flow, policy, route, lib/editor/upload-master-image, plus
-- die zugehörigen Tests). Migration läuft am Ende des PRs.

begin;

alter table public.project_images
  drop constraint if exists project_images_dpi_x_check,
  drop constraint if exists project_images_dpi_y_check,
  drop constraint if exists project_images_bit_depth_check,
  drop column if exists dpi_x,
  drop column if exists dpi_y,
  drop column if exists bit_depth,
  drop column if exists color_space;

drop type if exists public.color_space;

commit;
