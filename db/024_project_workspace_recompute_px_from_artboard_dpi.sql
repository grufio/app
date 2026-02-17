-- gruf.io - Recompute workspace px cache from artboard_dpi
--
-- Goal:
-- - enforce one canonical source for workspace geometry:
--   width_value/height_value + unit + artboard_dpi
-- - repair existing rows that still carry legacy 72-ppi derived px values
-- - keep trigger behavior deterministic on every insert/update

update public.project_workspace
set
  width_px_u = public.workspace_value_to_px_u(width_value, unit, artboard_dpi)::text,
  height_px_u = public.workspace_value_to_px_u(height_value, unit, artboard_dpi)::text;

update public.project_workspace
set
  width_px = greatest(1, (((width_px_u::bigint) + 500000) / 1000000)::int),
  height_px = greatest(1, (((height_px_u::bigint) + 500000) / 1000000)::int);

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
  new.width_px_u := public.workspace_value_to_px_u(new.width_value, new.unit, new.artboard_dpi)::text;
  new.height_px_u := public.workspace_value_to_px_u(new.height_value, new.unit, new.artboard_dpi)::text;

  w_u := new.width_px_u::bigint;
  h_u := new.height_px_u::bigint;

  w_px := greatest(1, ((w_u + 500000) / 1000000)::int);
  h_px := greatest(1, ((h_u + 500000) / 1000000)::int);

  new.width_px := w_px;
  new.height_px := h_px;
  return new;
end
$$;
