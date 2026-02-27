-- Re-enable persisted filter stack rows for current filter pipeline.
-- The app writes canonical filter chain rows into project_image_filters.

alter table public.project_image_filters
  drop constraint if exists project_image_filters_disabled_ck;

alter table public.project_image_filters
  drop constraint if exists project_image_filters_filter_type_ck;

alter table public.project_image_filters
  add constraint project_image_filters_filter_type_ck
  check (filter_type in ('pixelate', 'lineart', 'numerate'));
