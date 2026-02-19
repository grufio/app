-- gruf.io - Output-only DPI (separate from editor geometry)
--
-- Goal:
-- - Introduce `output_dpi` as the single output/export DPI (PDF/print)
-- - Keep editor geometry pixel-only (no DPI involvement)
-- - Bridge from legacy `artboard_dpi` during transition

alter table public.project_workspace
  add column if not exists output_dpi numeric;

update public.project_workspace
set output_dpi = coalesce(output_dpi, artboard_dpi, 300)
where output_dpi is null;

alter table public.project_workspace
  alter column output_dpi set default 300;

alter table public.project_workspace
  alter column output_dpi set not null;

alter table public.project_workspace
  drop constraint if exists project_workspace_output_dpi_positive;

alter table public.project_workspace
  add constraint project_workspace_output_dpi_positive check (output_dpi > 0);

