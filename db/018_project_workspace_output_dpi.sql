-- gruf.io - Output DPI stored separately from geometry
--
-- Purpose:
-- - Keep artboard geometry stable (Illustrator-style)
-- - Store output/export DPI separately

alter table public.project_workspace
  add column if not exists output_dpi_x numeric,
  add column if not exists output_dpi_y numeric;

-- Backfill existing rows (use current dpi as output reference).
update public.project_workspace
set
  output_dpi_x = coalesce(output_dpi_x, dpi_x, 300),
  output_dpi_y = coalesce(output_dpi_y, dpi_y, 300)
where output_dpi_x is null or output_dpi_y is null;

-- Defaults + constraints.
alter table public.project_workspace
  alter column output_dpi_x set default 300,
  alter column output_dpi_y set default 300;

alter table public.project_workspace
  alter column output_dpi_x set not null,
  alter column output_dpi_y set not null;

alter table public.project_workspace
  drop constraint if exists project_workspace_output_dpi_x_positive,
  drop constraint if exists project_workspace_output_dpi_y_positive;

alter table public.project_workspace
  add constraint project_workspace_output_dpi_x_positive check (output_dpi_x > 0),
  add constraint project_workspace_output_dpi_y_positive check (output_dpi_y > 0);
