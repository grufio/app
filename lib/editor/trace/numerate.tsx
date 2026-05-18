import { z } from "zod"

import type { TraceDefinition } from "./types"
import { DEFAULT_SUPERCELL_MM, MIN_SUPERCELL_MM } from "./numerate-grid-math"

export const numerateSchema = z.object({
  // The user picks one number — the supercell edge length in mm.
  // Cell count per axis derives from the image's displayed size on
  // the artboard (see `resolveNumerateGrid` in numerate-grid-math.ts).
  // Whatever doesn't divide into a whole supercell is centered and
  // cropped at trace time.
  supercell_mm: z.coerce.number().min(MIN_SUPERCELL_MM).default(DEFAULT_SUPERCELL_MM),
  // Palette quantisation — server uses this to flatten cell mean
  // colours into a fixed palette before SVG render.
  num_colors: z.coerce.number().int().min(2).max(256).default(16),
})

export type NumerateParams = z.infer<typeof numerateSchema>

export const numerateTrace = {
  id: "numerate",
  label: "Numerate",
  schema: numerateSchema,
  meta: {
    title: "Numerate",
    description: "Cell-grid overlay sized in mm from the image on the artboard.",
  },
  ui: {
    supercell_mm: { kind: "decimal", label: "Superpixel size (mm)", min: MIN_SUPERCELL_MM, step: 0.5 },
    num_colors: { label: "Number of Colors", min: 2, max: 256 },
  },
} as const satisfies TraceDefinition<typeof numerateSchema>
