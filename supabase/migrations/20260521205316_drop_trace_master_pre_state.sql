-- Drop the master_pre_*_px_u columns from project_image_trace.
--
-- These were introduced in PR #248 to back up the master-state-before-
-- pixelate-apply so that clear-trace could restore the master state to
-- its pre-floor-grid size. In the new model (PR B of the working-copy
-- refactor), pixelate-apply is non-destructive: it never mutates
-- project_image_state. Clear-trace is also non-destructive: it removes
-- only the trace_base + trace_output rows. master_pre_* is therefore
-- dead data with no remaining reader.
--
-- The PoC has no backward-compat requirement, so we drop the columns
-- outright instead of leaving them as legacy ballast.

ALTER TABLE public.project_image_trace
  DROP COLUMN master_pre_x_px_u,
  DROP COLUMN master_pre_y_px_u,
  DROP COLUMN master_pre_width_px_u,
  DROP COLUMN master_pre_height_px_u;
