-- @intent-schema-migration
--
-- Create the `pigment_swatches` storage bucket for manufacturer-paint
-- preview swatches plus its RLS policy.
--
-- Pattern follows the existing `project_images` bucket but with simpler
-- ownership: globally-readable for any authenticated user (paint swatches
-- are reference data, not user content). Path convention is
-- `<medium>/<brand>/<line>/<code>.jpg`, e.g. `oil/schmincke/norma/11114.jpg`.
--
-- No write policies on storage.objects → only service_role can upload
-- (one-shot bucket-fill job, not user-driven).

BEGIN;

INSERT INTO "storage"."buckets" ("id", "name", "public", "file_size_limit", "allowed_mime_types")
VALUES (
  'pigment_swatches',
  'pigment_swatches',
  false,
  1048576,
  ARRAY['image/webp', 'image/png', 'image/jpeg']
)
ON CONFLICT ("id") DO NOTHING;

CREATE POLICY "pigment_swatches_select"
  ON "storage"."objects"
  FOR SELECT
  TO "authenticated"
  USING ("bucket_id" = 'pigment_swatches');

COMMIT;
