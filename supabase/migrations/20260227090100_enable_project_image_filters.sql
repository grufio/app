-- Re-enable persisted filter stack rows for current filter pipeline.
-- Matches db/049_enable_project_image_filters.sql.

alter table public.project_image_filters
  drop constraint if exists project_image_filters_disabled_ck;

alter table public.project_image_filters
  drop constraint if exists project_image_filters_filter_type_ck;

alter table public.project_image_filters
  add constraint project_image_filters_filter_type_ck
  check (filter_type in ('pixelate', 'lineart', 'numerate'));
