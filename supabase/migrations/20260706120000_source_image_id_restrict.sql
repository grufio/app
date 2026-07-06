-- Realign project_images.source_image_id FK to ON DELETE RESTRICT (H1).
--
-- Intent vs. drift:
--   * The squashed baseline (20260519130800:1653) defines this self-referential
--     FK as ON DELETE RESTRICT.
--   * delete_master_with_cascade (20260522204823) is written explicitly against
--     RESTRICT — its fixed bottom-up delete order exists only so it never trips
--     this FK — and the sibling project_image_filters.input/output FKs are
--     deliberately RESTRICT too.
--   * Prod + db/schema.sql drifted to ON DELETE CASCADE. No migration ever
--     flipped it, so `supabase db reset` (local/CI) produced RESTRICT while prod
--     ran CASCADE — divergence on exactly the FK delete_master_with_cascade
--     depends on. verify:schema-drift only compares db/schema.sql <-> prod (both
--     CASCADE), so CI was blind to it.
--
-- Safety proof: tests/integration/delete-restrict-paths.test.ts shows
-- delete_project survives the deep master -> filter_output -> trace_base ->
-- trace_output topology under RESTRICT, and the only single-delete hazard
-- (removeProjectImageFilter on a filter output that carries a trace) is
-- UI-unreachable because filterLocked = hasTrace. RESTRICT's loud 23503 is
-- strictly safer than prod's silent CASCADE.
--
-- This migration re-establishes RESTRICT on prod; it is idempotent on a fresh
-- reset (the constraint is already RESTRICT there).

ALTER TABLE ONLY "public"."project_images"
  DROP CONSTRAINT "project_images_source_image_id_fkey";

ALTER TABLE ONLY "public"."project_images"
  ADD CONSTRAINT "project_images_source_image_id_fkey"
  FOREIGN KEY ("source_image_id") REFERENCES "public"."project_images"("id") ON DELETE RESTRICT;
