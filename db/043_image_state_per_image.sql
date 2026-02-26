-- Migration 043: Transform state per image (not per role)
--
-- Change primary key from (project_id, role) to (project_id, image_id)
-- to allow each filter image to have its own transform.

-- First, populate NULL image_id values with active master image
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

-- Drop old primary key
ALTER TABLE public.project_image_state
  DROP CONSTRAINT IF EXISTS project_image_state_pk;

-- Make image_id NOT NULL (required for primary key)
ALTER TABLE public.project_image_state
  ALTER COLUMN image_id SET NOT NULL;

-- Add new primary key on (project_id, image_id)
ALTER TABLE public.project_image_state
  ADD CONSTRAINT project_image_state_pk PRIMARY KEY (project_id, image_id);

-- Add index on role for queries that filter by role
CREATE INDEX IF NOT EXISTS project_image_state_role_idx
  ON public.project_image_state (role);
