-- F21 PR2: narrow project_image_filters.filter_type CHECK to pixelate.
--
-- F21 PR1 added project_image_trace as the new home for numerate
-- and lineart. F21 PR2 cuts the editor UI over to that surface and
-- deletes the legacy /api/.../filters/{numerate,lineart} routes.
-- The DB constraint can now follow: only `pixelate` is a valid
-- filter_type going forward.
--
-- Verified safe (2026-05-10): SELECT count(*) FROM
-- public.project_image_filters returned 0 in the linked prod
-- project, so no rows need porting/deletion.

ALTER TABLE public.project_image_filters
    DROP CONSTRAINT project_image_filters_filter_type_ck;

ALTER TABLE public.project_image_filters
    ADD CONSTRAINT project_image_filters_filter_type_ck
    CHECK (filter_type = 'pixelate');

-- Defensive deletion in case dev/preview environments have stale
-- numerate/lineart rows. Prod has 0 rows, verified before this PR.
DELETE FROM public.project_image_filters
WHERE filter_type IN ('numerate', 'lineart');
