-- @intent-backfill-migration
--
-- Backfill: rows in project_images that are referenced as a trace
-- output via project_image_trace.output_image_id were previously
-- labelled kind='filter_working_copy' (the only available variant).
-- Re-label them to the new kind='trace_output' value so editor-
-- target resolution can distinguish them from raster filter chain
-- members by kind alone.
--
-- Idempotent: rows already at trace_output are filtered out by the
-- WHERE clause. Safe to re-run.

UPDATE "public"."project_images" AS pi
SET kind = 'trace_output'::image_kind
FROM "public"."project_image_trace" AS pit
WHERE pi.id = pit.output_image_id
  AND pi.kind = 'filter_working_copy'::image_kind;
