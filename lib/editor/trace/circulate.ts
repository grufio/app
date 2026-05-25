import { z } from "zod"

import type { TraceDefinition } from "./types"
import { DEFAULT_INNER_FILTER, INNER_FILTER_IDS } from "./inner-color-filters"

/**
 * Circulate trace — a Chuck-Close-style dot grid: one ellipse per cell
 * (optionally a second inner ellipse), with contours instead of grid lines.
 * Shares the palette colour contract with Pixelate (`color_mode` picks the DB
 * palette the cell colour is snapped to; `color_space` is PDF-only).
 *
 * Geometry (resolved by `resolveCirculateGrid`, plan stage 4): the cell pitch
 * per axis = spacing-before + outer-ellipse + spacing-after, so
 * `cellsX = floor(displayMmW / pitch_w)`. Ellipses are drawn in crop-pixel
 * space, one `<g data-cell>` per cell (paint-by-numbers).
 *
 * NOTE: this module is intentionally NOT yet wired into `TRACE_REGISTRY` /
 * the server `TRACE_SCHEMAS`/`TRACE_HANDLERS`. Registering it there is gated
 * on the Python renderer (stage 3) + server handler (stage 4); adding it to
 * the registry early would surface a dead picker card and break the server's
 * `satisfies Record<RegisteredTraceId>` constraint. The schema + definition
 * land first (this stage) so the later stages have a typed contract to build
 * against.
 *
 * Defaults are provisional — the final values are settled with the bespoke
 * Circulate UI (plan stage 5). They are kept sane so the schema parses and
 * the pipeline can render meanwhile.
 */

/** Smallest accepted ellipse axis (mm). Grid fit is validated separately by
 * `resolveCirculateGrid`; this only rejects non-positive nonsense. */
export const MIN_ELLIPSE_MM = 1
const DEFAULT_OUTER_MM = 6
const DEFAULT_INNER_MM = 3
const DEFAULT_CONTOUR_MM = 0.2

export const circulateSchema = z.object({
  // Segment "Circle" — outer ellipse (mm). The cell's footprint before spacing.
  outer_width_mm: z.coerce.number().min(MIN_ELLIPSE_MM).default(DEFAULT_OUTER_MM),
  outer_height_mm: z.coerce.number().min(MIN_ELLIPSE_MM).default(DEFAULT_OUTER_MM),
  // Optional inner ellipse — the form checkbox gates the inner W/H row. When
  // off, only the outer ellipse is drawn; inner_* stay in the params so the
  // disabled UI keeps its last values.
  inner_enabled: z.boolean().default(false),
  inner_width_mm: z.coerce.number().min(MIN_ELLIPSE_MM).default(DEFAULT_INNER_MM),
  inner_height_mm: z.coerce.number().min(MIN_ELLIPSE_MM).default(DEFAULT_INNER_MM),
  // Segment "Spacing" — per-axis gaps (mm) around the outer ellipse. Pitch per
  // axis = spacing-before + outer + spacing-after (see `resolveCirculateGrid`).
  spacing_left_mm: z.coerce.number().min(0).default(0),
  spacing_right_mm: z.coerce.number().min(0).default(0),
  spacing_top_mm: z.coerce.number().min(0).default(0),
  spacing_bottom_mm: z.coerce.number().min(0).default(0),
  // Ellipse contour (stroke) width in mm — Circulate draws contours instead of
  // grid lines (0 = no contour). Converted to px at render time (crop space).
  contour_width_mm: z.coerce.number().min(0).default(DEFAULT_CONTOUR_MM),
  // Inner-ellipse colour = a pre-configured sub colour filter applied to the
  // cell colour, then snapped back to the palette so it never leaves it.
  // Presets live in `inner-color-filters.ts` (single source). "darker" is the
  // default so an enabled inner ellipse is visibly distinct (incl. greys).
  inner_filter: z.enum(INNER_FILTER_IDS).default(DEFAULT_INNER_FILTER),
  // Colors segment (shared contract with Pixelate): `color` → lab_munsell
  // (128), `bw` → lab_grays (48), strictly separate. `color_space` is PDF-only
  // and has no effect on colour detection (the match is always OKLab).
  color_mode: z.enum(["color", "bw"]).default("color"),
  color_space: z.enum(["rgb", "cmyk"]).default("rgb"),
})

export type CirculateParams = z.infer<typeof circulateSchema>

// `meta` + `ui` are only consumed by `GenericTraceController`. Circulate uses a
// bespoke dialog (like Pixelate, plan stage 5), so we don't carry orphan copy.
export const circulateTrace = {
  id: "circulate",
  label: "Circulate",
  schema: circulateSchema,
} as const satisfies TraceDefinition<typeof circulateSchema>
