-- gruf.io - Recompute workspace px cache from canonical µpx
--
-- Goal:
-- - derive cached integer px from canonical `width_px_u` / `height_px_u`
-- - no DPI-based geometry recompute

update public.project_workspace
set
  width_px = greatest(1, (((width_px_u::bigint) + 500000) / 1000000)::int),
  height_px = greatest(1, (((height_px_u::bigint) + 500000) / 1000000)::int);
