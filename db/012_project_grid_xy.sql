-- gruf.io - Grid spacing X/Y (MVP)
-- Adds independent grid spacing for X and Y axes.

alter table public.project_grid
  add column if not exists spacing_x_value numeric,
  add column if not exists spacing_y_value numeric;

-- Backfill existing single spacing_value into both axes.
update public.project_grid
set
  spacing_x_value = coalesce(spacing_x_value, spacing_value),
  spacing_y_value = coalesce(spacing_y_value, spacing_value)
where spacing_x_value is null or spacing_y_value is null;

alter table public.project_grid
  drop constraint if exists project_grid_spacing_x_positive;
alter table public.project_grid
  add constraint project_grid_spacing_x_positive check (spacing_x_value is null or spacing_x_value > 0);

alter table public.project_grid
  drop constraint if exists project_grid_spacing_y_positive;
alter table public.project_grid
  add constraint project_grid_spacing_y_positive check (spacing_y_value is null or spacing_y_value > 0);

