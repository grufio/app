-- Enforce canonical grid spacing X/Y on persisted grid rows.
--
-- Goal:
-- - Prevent unsupported states where `spacing_x_value` / `spacing_y_value` are NULL.
-- - Keep legacy `spacing_value` in sync with X-axis spacing for backwards compatibility.
--
-- Notes:
-- - This migration is forward-only and MVP-safe.
-- - Existing legacy migration lives in db/012_project_grid_xy.sql; this is the canonical CLI-first variant.

-- 1) Add independent grid spacing columns (if missing).
alter table public.project_grid
  add column if not exists spacing_x_value numeric,
  add column if not exists spacing_y_value numeric;

-- 2) Backfill from legacy single-axis spacing column.
update public.project_grid
set
  spacing_x_value = coalesce(spacing_x_value, spacing_value),
  spacing_y_value = coalesce(spacing_y_value, spacing_value)
where spacing_x_value is null or spacing_y_value is null;

-- 3) Enforce NOT NULL + positivity checks.
alter table public.project_grid
  alter column spacing_x_value set not null,
  alter column spacing_y_value set not null;

alter table public.project_grid
  drop constraint if exists project_grid_spacing_x_positive;
alter table public.project_grid
  add constraint project_grid_spacing_x_positive check (spacing_x_value > 0);

alter table public.project_grid
  drop constraint if exists project_grid_spacing_y_positive;
alter table public.project_grid
  add constraint project_grid_spacing_y_positive check (spacing_y_value > 0);

-- 4) Keep legacy `spacing_value` consistent with X spacing for older readers/writers.
create or replace function public.project_grid_sync_spacing_legacy()
returns trigger
language plpgsql
as $$
begin
  if new.spacing_x_value is null then
    new.spacing_x_value := new.spacing_value;
  end if;

  if new.spacing_y_value is null then
    new.spacing_y_value := new.spacing_value;
  end if;

  -- `spacing_value` remains the legacy single-axis column. Mirror X to preserve backwards compatibility.
  new.spacing_value := new.spacing_x_value;

  return new;
end
$$;

drop trigger if exists trg_project_grid_sync_spacing_legacy on public.project_grid;
create trigger trg_project_grid_sync_spacing_legacy
before insert or update on public.project_grid
for each row execute function public.project_grid_sync_spacing_legacy();

