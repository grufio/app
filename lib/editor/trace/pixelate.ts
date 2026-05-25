import { z } from "zod"

import type { TraceDefinition } from "./types"
import { DEFAULT_SUPERCELL_MM, MIN_SUPERCELL_MM } from "./pixelate-grid-math"

export const pixelateSchema = z.object({
  // Superpixel edge length per axis in mm — rectangular cells allowed.
  // Cell count per axis derives from the image's displayed size on
  // the artboard (see `resolvePixelateGrid` in pixelate-grid-math.ts).
  // Whatever doesn't divide into a whole supercell is centered and
  // cropped at trace time.
  supercell_width_mm: z.coerce.number().min(MIN_SUPERCELL_MM).default(DEFAULT_SUPERCELL_MM),
  supercell_height_mm: z.coerce.number().min(MIN_SUPERCELL_MM).default(DEFAULT_SUPERCELL_MM),
  // Palette quantisation — server uses this to flatten cell mean
  // colours into a fixed palette before SVG render.
  num_colors: z.coerce.number().int().min(2).max(256).default(16),
  // Palette mode: `color` → the 128-chip Munsell palette (`lab_munsell`);
  // `bw` → the 48 greys (`lab_grays`). Strictly separate, no mixing. The
  // form control lands with the Colors segment; the param drives which
  // palette the server snaps cells to.
  color_mode: z.enum(["color", "bw"]).default("color"),
})

export type PixelateParams = z.infer<typeof pixelateSchema>

// `meta` + `ui` are only consumed by `GenericTraceController` (which
// renders `BaseFilterController` + `GenericFilterForm`). Pixelate uses
// the bespoke `PixelateDialog` + `PixelateForm`, which hardcode the
// labels in German and ignore both fields — so we don't carry the
// orphan English copy here.
export const pixelateTrace = {
  id: "pixelate",
  label: "Pixelate",
  schema: pixelateSchema,
} as const satisfies TraceDefinition<typeof pixelateSchema>
