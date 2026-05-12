-- @intent-schema-migration
--
-- Tightens project_image_state to match the master.id-anchor invariant:
--
-- 1. Cascade state cleanup on soft-delete (C-D3).
--    The existing FK is ON DELETE CASCADE, but Postgres only fires it
--    on a hard DELETE. The application uses soft-delete via
--    `deleted_at IS NOT NULL`, so state rows for tombstoned images
--    linger forever. A trigger mirrors the cascade onto soft-deletes.
--
-- 2. Axis-pairing CHECK constraint (S-D1).
--    `x_px_u` / `y_px_u` are nullable to support the per-axis
--    preservation pattern (`{x, y=null}` means "keep the y from the
--    existing row"). But mixed-null pairs make no semantic sense.
--    The CHECK locks the invariant: either both set or both null.
--
-- IMPORTANT: ALTER TABLE ADD CONSTRAINT CHECK validates the existing
-- rows by default. Asymmetric rows (one axis null, the other set)
-- would fail the migration. The repair statements below NULL-out the
-- set axis on each asymmetric row before the CHECK is applied — this
-- matches the per-axis preservation semantic of the API layer, which
-- interprets an omitted axis as "preserve" rather than "zero".
--
-- Idempotent in spirit: re-running the trigger DROP/CREATE is safe;
-- the CHECK uses an explicit name so a second apply errors clearly.

-- 1) Soft-delete cascade trigger.
CREATE OR REPLACE FUNCTION public.cleanup_state_on_softdelete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.project_image_state
    WHERE image_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_images_softdelete_cascade_state
  ON public.project_images;

CREATE TRIGGER project_images_softdelete_cascade_state
  AFTER UPDATE OF deleted_at ON public.project_images
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION public.cleanup_state_on_softdelete();

-- 2) Repair asymmetric axis pairs BEFORE adding the CHECK.
-- Either axis being null means "preserve" — collapse the asymmetric
-- pair into a fully-null pair so the next user write resolves both.
UPDATE public.project_image_state
   SET x_px_u = NULL
 WHERE y_px_u IS NULL AND x_px_u IS NOT NULL;

UPDATE public.project_image_state
   SET y_px_u = NULL
 WHERE x_px_u IS NULL AND y_px_u IS NOT NULL;

-- 3) Axis-pairing CHECK constraint.
ALTER TABLE public.project_image_state
  ADD CONSTRAINT project_image_state_axis_pairing_check
  CHECK (
    (x_px_u IS NULL AND y_px_u IS NULL)
    OR (x_px_u IS NOT NULL AND y_px_u IS NOT NULL)
  );
