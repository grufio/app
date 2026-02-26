-- Migration 045: Cleanup NULL image_id values in project_image_state
--
-- Some old rows may have image_id=NULL if migration 043 wasn't applied yet.
-- This migration deletes orphaned rows or fills them with active master.

-- Option 1: Try to fill NULL image_ids with active master
UPDATE public.project_image_state pis
SET image_id = am.image_id
FROM (
  SELECT DISTINCT ON (project_id)
    project_id,
    id as image_id
  FROM public.project_images
  WHERE role = 'master'
    AND is_active = true
    AND deleted_at IS NULL
  ORDER BY project_id, created_at DESC
) am
WHERE pis.project_id = am.project_id
  AND pis.role = 'master'
  AND pis.image_id IS NULL;

-- Option 2: Delete any remaining rows with NULL image_id (orphaned)
DELETE FROM public.project_image_state
WHERE image_id IS NULL;
