-- Drop the dead `is_locked` column from project_images.
--
-- The editor moved to a single-artifact model; the column was never set
-- to true (the only writer, the PATCH .../lock route + `setLockedById`
-- client helper, had no caller after the section-lock UI was removed in
-- #506/#507). Every server `is_locked` early-return was therefore dead
-- code. This migration removes the column now that all references are
-- gone from the application code.
ALTER TABLE "public"."project_images" DROP COLUMN IF EXISTS "is_locked";
