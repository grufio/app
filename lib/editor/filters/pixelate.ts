import { z } from "zod"

import type { FilterDefinition } from "./types"

export const pixelateSchema = z.object({
  superpixel_width: z.coerce.number().int().min(1).default(10),
  superpixel_height: z.coerce.number().int().min(1).default(10),
  num_colors: z.coerce.number().int().min(2).max(256).default(16),
  color_mode: z.enum(["rgb", "grayscale"]).default("rgb"),
})

export type PixelateParams = z.infer<typeof pixelateSchema>

export const pixelateFilter = {
  id: "pixelate",
  label: "Pixelate",
  schema: pixelateSchema,
  ui: {
    superpixel_width: { min: 1 },
    superpixel_height: { min: 1 },
    num_colors: { min: 2, max: 256 },
  },
} as const satisfies FilterDefinition<typeof pixelateSchema>
