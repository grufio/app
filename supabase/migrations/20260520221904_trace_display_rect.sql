-- Add fixed display-rect columns to project_image_trace so the
-- editor can render a trace at its own crop-derived size and
-- position, independent of the master image's display rect.
--
-- Stored as text-encoded canonical-px-times-1e6 (µpx), mirroring
-- the convention on project_image_state (x_px_u/y_px_u/
-- width_px_u/height_px_u are text there). Wire format is string
-- end-to-end; the client wraps with BigInt() on read. Text avoids
-- the JS-Number precision question entirely.
--
-- DEFAULT '0' is the legacy-row signal: the client treats
-- display_width_px_u = '0' as "no fixed rect; render as today"
-- and falls back to the master state. Existing traces keep
-- working until re-applied.

ALTER TABLE public.project_image_trace
  ADD COLUMN display_x_px_u text NOT NULL DEFAULT '0',
  ADD COLUMN display_y_px_u text NOT NULL DEFAULT '0',
  ADD COLUMN display_width_px_u text NOT NULL DEFAULT '0',
  ADD COLUMN display_height_px_u text NOT NULL DEFAULT '0';
