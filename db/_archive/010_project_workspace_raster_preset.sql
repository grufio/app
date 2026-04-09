-- gruf.io - Persist Artboard raster effects quality preset (Illustrator-like)
--
-- We keep numeric dpi_x/dpi_y as the source of truth for math,
-- but store the chosen preset for UX ("High/Medium/Low").

alter table public.project_workspace
  add column if not exists raster_effects_preset text;

alter table public.project_workspace
  drop constraint if exists project_workspace_raster_effects_preset_check;
alter table public.project_workspace
  add constraint project_workspace_raster_effects_preset_check
  check (raster_effects_preset is null or raster_effects_preset in ('high', 'medium', 'low'));

