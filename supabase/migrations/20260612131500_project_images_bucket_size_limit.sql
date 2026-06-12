-- @intent-data-migration
-- @intent-no-type-impact
--
-- Codify the `project_images` bucket's file-size limit.
--
-- The client now uploads master-image bytes DIRECTLY to Supabase Storage
-- (bypassing the ~4.5 MB Vercel serverless request-body limit), so the bucket's
-- own `file_size_limit` is the first-line guard against oversized uploads. It
-- was never set in a migration (the bucket was created out-of-band), so pin it
-- here to match the app limit `DEFAULT_USER_MAX_UPLOAD_BYTES` (50 MB) enforced
-- server-side in `services/editor/server/master-image-upload/policy.ts`.
--
-- Idempotent: a no-op (0 rows) wherever the bucket doesn't exist yet (local /
-- CI), and a plain value update in prod. `allowed_mime_types` is intentionally
-- left untouched — finalize validates MIME server-side from the decoded bytes.

UPDATE "storage"."buckets"
SET "file_size_limit" = 52428800  -- 50 * 1024 * 1024
WHERE "id" = 'project_images';
