-- Trace becomes a destructive crop of the master.
--
-- Pixelate apply now updates project_image_state for master.id with
-- the floor-grid-cropped dimensions. The trace_base bitmap renders
-- at the new (smaller) master rect; the right panel shows the same
-- dims on every tab. Cells stay exactly at the user-set supercell
-- mm — the floor-grid remainder (e.g. 2mm at 200/6) is removed
-- from the master, not hidden behind a transparent border.
--
-- Reversibility on clear-trace requires storing the pre-apply
-- master rect on the trace row, so dropping the (now redundant)
-- display rect columns added in PR #239 and adding pre-state
-- columns in their place.
--
-- Legacy trace rows that pre-date this migration will have '0' in
-- the pre-state columns. Clear-trace will see '0' and skip the
-- restore (leaving master at whatever its current state is). To
-- get a clean restore, those traces must be cleared and re-applied
-- after this migration lands.

ALTER TABLE public.project_image_trace
  DROP COLUMN display_x_px_u,
  DROP COLUMN display_y_px_u,
  DROP COLUMN display_width_px_u,
  DROP COLUMN display_height_px_u,
  ADD COLUMN master_pre_x_px_u text NOT NULL DEFAULT '0',
  ADD COLUMN master_pre_y_px_u text NOT NULL DEFAULT '0',
  ADD COLUMN master_pre_width_px_u text NOT NULL DEFAULT '0',
  ADD COLUMN master_pre_height_px_u text NOT NULL DEFAULT '0';
