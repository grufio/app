-- Persistent initial display rect for master images.
--
-- The "round arrow" restore button must reset the master to the
-- placement that `computeImagePlacementPx` chose at upload time.
-- Until now that value was only computed on demand (= same input
-- = same output, but no explicit source of truth in the DB). After
-- pixelate apply destructively crops `project_image_state`, the
-- pre-crop master-state row's values are gone — and any algorithm
-- change to `computeImagePlacementPx` would silently move what
-- "restore" means for already-uploaded images.
--
-- Solution: store the initial display rect on the master row at
-- upload time. Immutable after the master is inserted (no code
-- path updates these columns ever again).
--
-- NOT NULL DEFAULT '0' so existing rows accept the column add
-- without backfill — this is a PoC, legacy masters aren't
-- backward-compatible and would need a re-upload to get correct
-- initial_display_* values. Restore for legacy rows would fall to
-- (0, 0, 0×0), which is obviously wrong; acceptable for PoC where
-- the user re-creates test projects.

ALTER TABLE public.project_images
  ADD COLUMN initial_display_x_px_u text NOT NULL DEFAULT '0',
  ADD COLUMN initial_display_y_px_u text NOT NULL DEFAULT '0',
  ADD COLUMN initial_display_width_px_u text NOT NULL DEFAULT '0',
  ADD COLUMN initial_display_height_px_u text NOT NULL DEFAULT '0';
