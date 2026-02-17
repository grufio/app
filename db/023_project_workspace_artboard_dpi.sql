-- gruf.io - Consolidate workspace DPI to a single artboard value
--
-- Goal:
-- - introduce one authoritative DPI field for workspace/artboard: `artboard_dpi`
-- - migrate existing values from legacy columns
-- - remove redundant legacy columns: dpi_x/dpi_y/output_dpi_x/output_dpi_y

alter table public.project_workspace
  add column if not exists artboard_dpi numeric;

update public.project_workspace
set artboard_dpi = coalesce(artboard_dpi, output_dpi_x, dpi_x, output_dpi_y, dpi_y, 300)
where artboard_dpi is null;

-- Ensure canonical/cached pixel fields are consistent with the new single DPI source.
update public.project_workspace
set
  width_px_u = coalesce(width_px_u, public.workspace_value_to_px_u(width_value, unit, artboard_dpi)::text),
  height_px_u = coalesce(height_px_u, public.workspace_value_to_px_u(height_value, unit, artboard_dpi)::text);

update public.project_workspace
set
  width_px = greatest(1, (((width_px_u::bigint) + 500000) / 1000000)::int),
  height_px = greatest(1, (((height_px_u::bigint) + 500000) / 1000000)::int);

alter table public.project_workspace
  alter column artboard_dpi set default 300;

alter table public.project_workspace
  alter column artboard_dpi set not null;

alter table public.project_workspace
  drop constraint if exists project_workspace_artboard_dpi_positive;

alter table public.project_workspace
  add constraint project_workspace_artboard_dpi_positive check (artboard_dpi > 0);

create or replace function public.project_workspace_sync_px_cache()
returns trigger
language plpgsql
as $$
declare
  w_u bigint;
  h_u bigint;
  w_px int;
  h_px int;
begin
  if new.width_px_u is null then
    new.width_px_u := public.workspace_value_to_px_u(new.width_value, new.unit, new.artboard_dpi)::text;
  end if;
  if new.height_px_u is null then
    new.height_px_u := public.workspace_value_to_px_u(new.height_value, new.unit, new.artboard_dpi)::text;
  end if;

  w_u := new.width_px_u::bigint;
  h_u := new.height_px_u::bigint;

  w_px := greatest(1, ((w_u + 500000) / 1000000)::int);
  h_px := greatest(1, ((h_u + 500000) / 1000000)::int);

  new.width_px := w_px;
  new.height_px := h_px;
  return new;
end
$$;

alter table public.project_workspace
  drop column if exists dpi_x,
  drop column if exists dpi_y,
  drop column if exists output_dpi_x,
  drop column if exists output_dpi_y;
