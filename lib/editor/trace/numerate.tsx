import { z } from "zod"

import type { TraceDefinition } from "./types"

export const numerateSchema = z.object({
  // Float pitch (F22): "Number of cells" mode in the wizard computes
  // these as `imageDim / cellCount`, which is fractional for any image
  // that isn't an exact multiple. The Python service rounds for the
  // bitmap-quantisation pass (numpy demands integer reshape) but uses
  // the float pitch in the SVG output via a scale transform — net
  // result is exact image coverage with sub-px grid alignment.
  superpixel_width: z.coerce.number().min(0.1).default(10),
  superpixel_height: z.coerce.number().min(0.1).default(10),
  stroke_width: z.coerce.number().min(0.1).max(20).default(1),
  show_colors: z.coerce.boolean().default(true),
  // F20: palette quantisation. vtracer collapses adjacent same-color
  // superpixel cells into one polygon — without quantisation each
  // cell's mean is unique and no merging happens.
  num_colors: z.coerce.number().int().min(2).max(256).default(16),
})

export type NumerateParams = z.infer<typeof numerateSchema>

export const numerateTrace = {
  id: "numerate",
  label: "Numerate",
  schema: numerateSchema,
  meta: {
    title: "Numerate",
    description: "Create a vector grid overlay from pixelated superpixels.",
  },
  ui: {
    superpixel_width: { kind: "decimal", label: "Superpixel Width (px)", min: 0.1, max: 200, step: 0.01 },
    superpixel_height: { kind: "decimal", label: "Superpixel Height (px)", min: 0.1, max: 200, step: 0.01 },
    stroke_width: { kind: "decimal", label: "Vector Line Width (px)", min: 0.1, max: 20, step: 0.1 },
    show_colors: { kind: "boolean", label: "Show Colors" },
    num_colors: { label: "Number of Colors", min: 2, max: 256 },
  },
} as const satisfies TraceDefinition<typeof numerateSchema>
