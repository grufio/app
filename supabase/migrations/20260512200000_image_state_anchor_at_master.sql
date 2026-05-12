-- @intent-backfill-migration
--
-- Re-anchor project_image_state at the project's master.id. Up to
-- now the image_id column has tracked whichever filter_working_copy
-- the editor last wrote against, which means: when the filter base
-- copy gets recreated (chain reset, source mismatch), the row is
-- orphaned and the user's persisted transform vanishes on reload.
--
-- master.id is the only stable anchor on a project (immutable, guarded
-- by `guard_master_immutable`); both SSR and the dashboard already
-- treat it as the persistence target.
--
-- This migration is **additive** — it mirrors the latest persisted
-- transform per project onto a row keyed by master.id and leaves
-- existing rows in place. The old Vercel build keeps reading from
-- the original (filter_working_copy.id) rows during the deploy
-- window. A follow-up migration in the next PR drops the legacy
-- rows once the new code has baked.
--
-- Idempotent: re-running collapses any newer writes via ON CONFLICT.

WITH latest_state AS (
  SELECT DISTINCT ON (project_id)
    project_id, x_px_u, y_px_u, width_px_u, height_px_u, rotation_deg
  FROM "public"."project_image_state"
  ORDER BY project_id, updated_at DESC
),
master_per_project AS (
  SELECT DISTINCT ON (project_id) project_id, id AS master_id
  FROM "public"."project_images"
  WHERE kind = 'master' AND deleted_at IS NULL
  ORDER BY project_id, created_at ASC
)
INSERT INTO "public"."project_image_state"
  (project_id, image_id, x_px_u, y_px_u, width_px_u, height_px_u, rotation_deg)
SELECT
  m.project_id, m.master_id,
  l.x_px_u, l.y_px_u, l.width_px_u, l.height_px_u, l.rotation_deg
FROM master_per_project m
JOIN latest_state l ON l.project_id = m.project_id
ON CONFLICT (project_id, image_id) DO UPDATE SET
  x_px_u = EXCLUDED.x_px_u,
  y_px_u = EXCLUDED.y_px_u,
  width_px_u = EXCLUDED.width_px_u,
  height_px_u = EXCLUDED.height_px_u,
  rotation_deg = EXCLUDED.rotation_deg;
