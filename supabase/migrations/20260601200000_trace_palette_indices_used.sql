-- @intent-additive-column
--
-- Capture the set of palette chips actually used in a trace's
-- snapped output. Populated by the filter-service (`/filters/pixelate`
-- and `/filters/circulate`) and persisted by the editor server on
-- trace apply (`services/editor/server/trace/index.ts`).
--
-- Drives the mobile Colors sheet: instead of showing the full 128-chip
-- Munsell palette, the sheet renders only the chips that actually
-- appear in the current trace.
--
-- Nullable + no default — existing rows stay NULL until re-run. The
-- Colors sheet surfaces a "re-run trace to capture colors" empty state
-- for legacy rows. Lineart traces (no palette) also stay NULL.

ALTER TABLE "public"."project_image_trace"
  ADD COLUMN IF NOT EXISTS "palette_indices_used" integer[];
