-- Rename trace kind `numerate` → `pixelate`. The TypeScript registry,
-- filter-service route, and dialog were all renamed in the same PR;
-- this migration brings the DB CHECK + existing rows in line.
--
-- Bestandsrows mit `params.supercell_mm` (single-axis legacy field)
-- werden in `supercell_width_mm` + `supercell_height_mm` umgemapped
-- damit der neue Zod-Schema (mit getrennten Werten) sie ohne Read-
-- Fallback validiert. Strip-mode toleriert das alte `supercell_mm`-
-- Feld weiterhin, aber den Default würde es sonst auf 6 setzen,
-- statt dem User-gewählten Wert.

BEGIN;

-- 1. Migrate params payload: single supercell_mm → axis-pair.
UPDATE public.project_image_trace
SET params = jsonb_set(
              jsonb_set(
                params - 'supercell_mm',
                '{supercell_width_mm}',
                params->'supercell_mm',
                true
              ),
              '{supercell_height_mm}',
              params->'supercell_mm',
              true
            )
WHERE kind = 'numerate'
  AND params ? 'supercell_mm';

-- 2. Rename the kind itself.
UPDATE public.project_image_trace
SET kind = 'pixelate'
WHERE kind = 'numerate';

-- 3. Swap the CHECK constraint.
ALTER TABLE public.project_image_trace
  DROP CONSTRAINT project_image_trace_kind_ck;

ALTER TABLE public.project_image_trace
  ADD CONSTRAINT project_image_trace_kind_ck
  CHECK (kind = ANY (ARRAY['pixelate'::text, 'lineart'::text]));

COMMIT;
