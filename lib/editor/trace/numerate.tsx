import { z } from "zod"

import type { TraceDefinition } from "./types"

export const numerateSchema = z.object({
  superpixel_width: z.coerce.number().int().min(1).default(10),
  superpixel_height: z.coerce.number().int().min(1).default(10),
  stroke_width: z.coerce.number().min(0.1).max(20).default(2),
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
    superpixel_width: { label: "Superpixel Width (px)", min: 1, max: 200 },
    superpixel_height: { label: "Superpixel Height (px)", min: 1, max: 200 },
    stroke_width: { kind: "decimal", label: "Vector Line Width (px)", min: 0.1, max: 20, step: 0.1 },
    show_colors: { kind: "boolean", label: "Show Colors" },
    num_colors: { label: "Number of Colors", min: 2, max: 256 },
  },
} as const satisfies TraceDefinition<typeof numerateSchema>
