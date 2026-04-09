-- Migration 044: Cleanup duplicate foreign keys
--
-- If migrations were applied multiple times, there may be duplicate FKs.
-- This migration ensures only the correct FK exists.

DO $$
DECLARE
  fk_count INTEGER;
BEGIN
  -- Count FKs from project_images.project_id to projects.id
  SELECT COUNT(*) INTO fk_count
  FROM pg_constraint
  WHERE conrelid = 'project_images'::regclass
    AND contype = 'f'
    AND confrelid = 'projects'::regclass;

  -- If more than 1 FK exists, drop all and recreate the canonical one
  IF fk_count > 1 THEN
    -- Drop all FKs from project_images to projects
    DECLARE
      fk_name TEXT;
    BEGIN
      FOR fk_name IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'project_images'::regclass
          AND contype = 'f'
          AND confrelid = 'projects'::regclass
      LOOP
        EXECUTE format('ALTER TABLE project_images DROP CONSTRAINT IF EXISTS %I', fk_name);
      END LOOP;
    END;

    -- Recreate the canonical FK
    ALTER TABLE public.project_images
      ADD CONSTRAINT project_images_project_id_fkey
      FOREIGN KEY (project_id)
      REFERENCES public.projects(id)
      ON DELETE CASCADE;
  END IF;
END $$;
