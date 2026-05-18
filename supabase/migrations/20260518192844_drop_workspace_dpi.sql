-- Artboard ohne DPI (Illustrator-Parität): drop `project_workspace.output_dpi`
-- and `raster_effects_preset`. Internal geometry switches to a fixed
-- 1 px = 1/72 inch mapping, so all stored µpx values must be rescaled by
-- `72 / old_dpi` to preserve the same physical millimetre dimensions.
--
-- Scaling is applied symmetrically to workspace + image-state geometry
-- so relative placement (image-on-artboard) stays visually identical.
--
-- The legacy `workspace_value_to_px_u(numeric, measure_unit, numeric)`
-- function is dropped (no triggers, no `.rpc()` callers — verified by
-- grep before this migration was written).

BEGIN;

UPDATE public.project_workspace
SET
  width_px_u  = ROUND(width_px_u::numeric  * 72 / output_dpi)::text,
  height_px_u = ROUND(height_px_u::numeric * 72 / output_dpi)::text;

UPDATE public.project_image_state pis
SET
  width_px_u  = ROUND(pis.width_px_u::numeric  * 72 / pw.output_dpi)::text,
  height_px_u = ROUND(pis.height_px_u::numeric * 72 / pw.output_dpi)::text,
  x_px_u      = CASE WHEN pis.x_px_u IS NOT NULL
                     THEN ROUND(pis.x_px_u::numeric * 72 / pw.output_dpi)::text END,
  y_px_u      = CASE WHEN pis.y_px_u IS NOT NULL
                     THEN ROUND(pis.y_px_u::numeric * 72 / pw.output_dpi)::text END
FROM public.project_workspace pw
WHERE pis.project_id = pw.project_id;

ALTER TABLE public.project_workspace
  DROP COLUMN output_dpi,
  DROP COLUMN raster_effects_preset;

DROP FUNCTION IF EXISTS public.workspace_value_to_px_u CASCADE;

COMMIT;
