-- gruf.io - Recompute workspace px cache from artboard_dpi
--
-- Goal:
-- - enforce one canonical source for workspace geometry:
--   width_value/height_value + unit + artboard_dpi
-- - repair existing rows that still carry legacy 72-ppi derived px values
-- - keep this migration as data-repair only (trigger semantics are owned by db/023)

update public.project_workspace
set
  width_px_u = public.workspace_value_to_px_u(width_value, unit, artboard_dpi)::text,
  height_px_u = public.workspace_value_to_px_u(height_value, unit, artboard_dpi)::text;

update public.project_workspace
set
  width_px = greatest(1, (((width_px_u::bigint) + 500000) / 1000000)::int),
  height_px = greatest(1, (((height_px_u::bigint) + 500000) / 1000000)::int);
