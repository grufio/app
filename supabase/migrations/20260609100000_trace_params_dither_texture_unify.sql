-- @intent-data-migration
--
-- Unify Dither + Texture trace params (PR #437 follow-up).
--
-- PR #437 ("feat(trace): unify Dither + Texture — Texture is a 4th
-- dither mode") replaced the legacy `texture_enabled` +
-- `texture_strength` + `dither_pattern_size` triple with a single
-- `dither_strength` (0.25 / 0.5 / 0.75 / 1) consumed by both
-- Knoll-Yliluoma and the new `dither_mode = "texture"` case. The Zod
-- schema is shape-clean — no backwards-compat preprocess — so the
-- only path that still produces the old shape is a stale Vercel
-- function instance racing the deploy.
--
-- This migration rewrites every legacy pixelate/circulate row in-place
-- so DB and Schema agree.
--
-- Mapping rules (mirror of the plan):
--   * texture_enabled = true              → dither_mode = "texture"
--                                            dither_strength = texture_strength
--                                                              (or 0.5 default)
--   * dither_mode = "knoll_yliluoma"      → dither_strength derived from
--     (and texture_enabled != true)        dither_pattern_size:
--                                            {2:0.25, 4:0.5, 8:0.75, 16:1}
--   * everything else                     → dither_strength = 0.5
--                                            (default, ignored by the mode)
--
-- All three legacy keys (`texture_enabled`, `texture_strength`,
-- `dither_pattern_size`) are removed from the params blob in every
-- touched row. Lineart rows are skipped — they have no dither/texture
-- concept.
--
-- Pre-conditions for the prod push:
--   1. PR #437 must already be on main and live on Vercel.
--   2. Wait ≥ 15 min after the Vercel alias swap so in-flight Lambda
--      instances on the old version have rotated out, otherwise a
--      stale instance could write a fresh legacy-shape row right
--      after the migration commits.

-- PRE-CHECK: split the legacy row counts into the three Mapping-
-- relevant subsets so an operator can sanity-check before the UPDATE
-- runs.
--   * texture_legacy: rows that will switch to dither_mode = "texture"
--   * ky_legacy:      rows that will only rewrite dither_pattern_size
--                     → dither_strength
--   * double_state:   texture_enabled = true AND dither_mode != "none";
--                     UI-impossible today but theoretically in DB. We
--                     pick "texture" and drop the KY/FS choice — log
--                     the WARNING so an operator can abort if the
--                     count is unexpected (production count should be
--                     0).
DO $$
DECLARE
  texture_legacy INT;
  ky_legacy      INT;
  double_state   INT;
BEGIN
  SELECT COUNT(*) INTO texture_legacy
  FROM project_image_trace
  WHERE kind IN ('pixelate', 'circulate')
    AND (params->>'texture_enabled')::boolean IS TRUE;

  SELECT COUNT(*) INTO ky_legacy
  FROM project_image_trace
  WHERE kind IN ('pixelate', 'circulate')
    AND params->>'dither_mode' = 'knoll_yliluoma'
    AND params ? 'dither_pattern_size'
    AND (params->>'texture_enabled')::boolean IS NOT TRUE;

  SELECT COUNT(*) INTO double_state
  FROM project_image_trace
  WHERE kind IN ('pixelate', 'circulate')
    AND (params->>'texture_enabled')::boolean IS TRUE
    AND params->>'dither_mode' IS NOT NULL
    AND params->>'dither_mode' != 'none';

  RAISE NOTICE 'trace-params unify: % texture-legacy, % ky-legacy', texture_legacy, ky_legacy;
  IF double_state > 0 THEN
    RAISE WARNING 'trace-params unify: % rows have BOTH texture_enabled=true AND non-none dither_mode — picking "texture" and dropping the dither mode', double_state;
  END IF;
END $$;

-- Rewrite the params blob in place. Strip the three legacy keys
-- (`-` operator removes the key if present, no-op if missing) and
-- merge in the two new keys via `jsonb_build_object`. Idempotent: the
-- WHERE clause skips rows that already match the new shape.
UPDATE project_image_trace
SET params = (
  (params - 'texture_enabled' - 'texture_strength' - 'dither_pattern_size')
  || jsonb_build_object(
    'dither_mode',
    CASE WHEN (params->>'texture_enabled')::boolean IS TRUE THEN 'texture'
         ELSE COALESCE(params->>'dither_mode', 'knoll_yliluoma')
    END,
    'dither_strength',
    CASE WHEN (params->>'texture_enabled')::boolean IS TRUE
            THEN COALESCE((params->>'texture_strength')::numeric, 0.5)
         WHEN params->>'dither_mode' = 'knoll_yliluoma' THEN
            CASE COALESCE((params->>'dither_pattern_size')::int, 4)
              WHEN 2  THEN 0.25
              WHEN 4  THEN 0.5
              WHEN 8  THEN 0.75
              WHEN 16 THEN 1
              ELSE 0.5
            END
         ELSE 0.5
    END
  )
)
WHERE kind IN ('pixelate', 'circulate')
  AND (params ? 'texture_enabled'
    OR params ? 'texture_strength'
    OR params ? 'dither_pattern_size');

-- POST-CHECK: verify no legacy keys remain. If anything escapes the
-- UPDATE (a row written between PRE-CHECK and now by a stale Lambda),
-- raise — the operator should re-run the migration once the deploy
-- has fully rolled out.
DO $$
DECLARE
  remaining INT;
BEGIN
  SELECT COUNT(*) INTO remaining
  FROM project_image_trace
  WHERE kind IN ('pixelate', 'circulate')
    AND (params ? 'texture_enabled'
      OR params ? 'texture_strength'
      OR params ? 'dither_pattern_size');
  IF remaining > 0 THEN
    RAISE EXCEPTION 'trace-params unify: % rows still carry legacy keys', remaining;
  END IF;
END $$;
