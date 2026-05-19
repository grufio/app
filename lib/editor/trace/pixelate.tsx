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
})

export type PixelateParams = z.infer<typeof pixelateSchema>

export const pixelateTrace = {
  id: "pixelate",
  label: "Pixelate",
  schema: pixelateSchema,
  meta: {
    title: "Pixelate",
    description: "Cell-grid overlay sized in mm from the image on the artboard.",
  },
  ui: {
    supercell_width_mm: { kind: "decimal", label: "Superpixel width (mm)", min: MIN_SUPERCELL_MM, step: 0.5 },
    supercell_height_mm: { kind: "decimal", label: "Superpixel height (mm)", min: MIN_SUPERCELL_MM, step: 0.5 },
    num_colors: { label: "Number of Colors", min: 2, max: 256 },
  },
} as const satisfies TraceDefinition<typeof pixelateSchema>
