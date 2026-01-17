-- gruf.io - Persist image display meta (unit + dpi) on image state
--
-- The artboard is px-only for editor interaction.
-- Unit + DPI belong to the image for display/inputs; export can still define its own DPI later.

alter table public.project_image_state
  add column if not exists unit public.measure_unit,
  add column if not exists dpi numeric;

alter table public.project_image_state
  drop constraint if exists project_image_state_dpi_positive;
alter table public.project_image_state
  add constraint project_image_state_dpi_positive check (dpi is null or dpi > 0);

