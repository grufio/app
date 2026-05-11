-- PR-3: Drop legacy single-axis spacing_value column + sync trigger.
--
-- Historie: project_grid hatte ursprünglich nur spacing_value (single-axis).
-- Mit der zweiachsigen Spacing-Funktion kamen spacing_x_value und
-- spacing_y_value dazu; spacing_value blieb als NOT NULL stehen, ein
-- Trigger spiegelte spacing_x_value → spacing_value für Backwards-Compat.
-- Code wurde bereits auf reine x/y-Spalten umgestellt; diese Migration
-- entfernt das Mirror-Setup vollständig.
--
-- Reihenfolge ist innerhalb dieses PRs sicher: der TS-Code (Types,
-- operations, default, browser-repo, grid-panel) wurde im selben PR
-- so geändert, dass er spacing_value nicht mehr setzt. Die DB-Migration
-- läuft am Ende des PRs und droppt Trigger → Funktion → Column → Check.

begin;

drop trigger if exists trg_project_grid_sync_spacing_legacy on public.project_grid;
drop function if exists public.project_grid_sync_spacing_legacy();

alter table public.project_grid
  drop constraint if exists project_grid_spacing_value_check,
  drop column if exists spacing_value;

commit;
