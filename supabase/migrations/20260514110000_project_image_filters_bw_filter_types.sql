-- @intent-schema-migration
--
-- Replace `project_image_filters.filter_type` CHECK allow-list with
-- the three B&W variants. Old values (`pixelate`, `lineart`,
-- `numerate`) are removed:
--   - `pixelate` becomes obsolete because the user-facing pixelate
--     functionality is now covered by the trace/numerate path
--     (separate `project_image_trace` table).
--   - `lineart` and `numerate` never belonged in `project_image_filters`
--     in the first place — they got listed in the original CHECK
--     before traces were split into their own table. After the split
--     no production code writes those values to `project_image_filters`.
--
-- Guard before the swap: raise an exception if any existing
-- `project_image_filters` row carries a filter_type outside the new
-- allow-list. This forces the operator to clean up (or back up + truncate)
-- old rows in a separate cleanup migration before re-running this one.
-- Prod expectation: zero such rows.

do $$
begin
  if exists (
    select 1 from public.project_image_filters
    where filter_type not in ('bw_hard', 'bw_soft', 'bw_warm')
  ) then
    raise exception 'project_image_filters contains rows with filter_type outside the new allow-list (bw_hard, bw_soft, bw_warm). Clean up legacy rows in a separate migration before re-running.';
  end if;
end $$;

alter table public.project_image_filters
  drop constraint project_image_filters_filter_type_ck;

alter table public.project_image_filters
  add constraint project_image_filters_filter_type_ck
  check (filter_type = any (array['bw_hard', 'bw_soft', 'bw_warm']));
