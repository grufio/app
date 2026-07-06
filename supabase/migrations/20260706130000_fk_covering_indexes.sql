-- Add covering indexes for the four user-table foreign keys that lack one.
--
-- Without an index on the *referencing* column, deleting a *referenced* row
-- forces Postgres to seq-scan the child table to enforce the FK. All four of
-- these FKs feed the delete_master_with_cascade / delete_project paths, so the
-- missing indexes are on exactly the columns those cascades probe:
--
--   project_images.source_image_id        (self-ref; RESTRICT — probed per delete)
--   project_image_state.image_id          (-> project_images)
--   project_image_trace.base_image_id     (-> project_images; RESTRICT)
--   project_image_trace.output_image_id   (-> project_images; CASCADE)
--
-- Plain CREATE INDEX (not CONCURRENTLY): these tables are tiny (hundreds of
-- rows at most), so the build locks each for ~1ms, and CONCURRENTLY can't run
-- inside the migration transaction anyway. Matches the repo's existing
-- FK-index style (project_image_filters_input_image_idx, ...).

CREATE INDEX "project_images_source_image_idx"
  ON "public"."project_images" USING "btree" ("source_image_id");

CREATE INDEX "project_image_state_image_idx"
  ON "public"."project_image_state" USING "btree" ("image_id");

CREATE INDEX "project_image_trace_base_image_idx"
  ON "public"."project_image_trace" USING "btree" ("base_image_id");

CREATE INDEX "project_image_trace_output_image_idx"
  ON "public"."project_image_trace" USING "btree" ("output_image_id");
