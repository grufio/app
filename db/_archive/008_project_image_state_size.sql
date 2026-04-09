-- gruf.io - Persist editor "working copy" image size (px) alongside transform
--
-- Motivation:
-- Storing only scale_x/scale_y is fragile because scale needs the original image's px dimensions.
-- Persisting the *working* size (width_px/height_px) makes the restore on reload deterministic.

alter table public.project_image_state
  add column if not exists width_px numeric,
  add column if not exists height_px numeric;

-- Ensure positive values when present
alter table public.project_image_state
  drop constraint if exists project_image_state_width_px_positive;
alter table public.project_image_state
  add constraint project_image_state_width_px_positive check (width_px is null or width_px > 0);

alter table public.project_image_state
  drop constraint if exists project_image_state_height_px_positive;
alter table public.project_image_state
  add constraint project_image_state_height_px_positive check (height_px is null or height_px > 0);

