-- @intent-no-type-impact
--
-- Change project_image_trace.output_image_id FK from ON DELETE RESTRICT
-- to ON DELETE CASCADE.
--
-- A trace row carries the generated SVG for a single output image
-- (one row per project, keyed by project_id). When that output image
-- is deleted, the trace row has no referent and must be regenerated
-- on the next trace operation. Keeping RESTRICT blocks legitimate
-- image deletes (working-copy / filter chain tip cleanup) with a
-- foreign-key violation. CASCADE is the correct semantic: drop the
-- now-orphaned trace row alongside its output image.

ALTER TABLE "public"."project_image_trace"
    DROP CONSTRAINT IF EXISTS "project_image_trace_output_image_id_fkey";

ALTER TABLE "public"."project_image_trace"
    ADD CONSTRAINT "project_image_trace_output_image_id_fkey"
    FOREIGN KEY ("output_image_id")
    REFERENCES "public"."project_images"("id")
    ON DELETE CASCADE;
