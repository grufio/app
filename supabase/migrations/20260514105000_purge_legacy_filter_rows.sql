-- @intent-data-migration
--
-- Delete legacy `project_image_filters` rows with filter_type in
-- `('pixelate', 'lineart', 'numerate')` so the follow-up migration
-- `20260514110000_project_image_filters_bw_filter_types.sql` (which
-- swaps the CHECK allow-list to `bw_hard/bw_soft/bw_warm`) can pass
-- its own pre-flight guard.
--
-- Why these rows exist:
--   - `pixelate` rows: from early dev iterations of the pixelate
--     filter. The user-facing pixelate functionality is now covered
--     by the trace/numerate path in `project_image_trace` (separate
--     table).
--   - `lineart` / `numerate` rows: would never have been written by
--     post-trace-split code, but were allowed by the original CHECK.
--     Belong in `project_image_trace`, not here.
--
-- This DELETE only removes the filter-row metadata. The output
-- `project_images` rows that were produced by these filters stay
-- (FK is on `project_image_filters.output_image_id` → `project_images.id`
--  with ON DELETE RESTRICT — the parent image is unaffected). The
-- editor's filter sidebar will stop showing the legacy filter
-- entries, but the working-copy/filter-output images themselves are
-- not destroyed.
--
-- RAISE NOTICE logs the per-type counts before the DELETE so the
-- migration output makes the impact visible.

do $$
declare
  v_pixelate int;
  v_lineart int;
  v_numerate int;
begin
  select count(*) into v_pixelate from public.project_image_filters where filter_type = 'pixelate';
  select count(*) into v_lineart  from public.project_image_filters where filter_type = 'lineart';
  select count(*) into v_numerate from public.project_image_filters where filter_type = 'numerate';
  raise notice 'purge_legacy_filter_rows: pixelate=% lineart=% numerate=% (total=%)',
    v_pixelate, v_lineart, v_numerate, (v_pixelate + v_lineart + v_numerate);
end $$;

delete from public.project_image_filters
where filter_type in ('pixelate', 'lineart', 'numerate');
