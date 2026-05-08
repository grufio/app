import { z } from "zod"

import type { FilterDefinition } from "./types"

export const numerateSchema = z.object({
  superpixel_width: z.coerce.number().int().min(1).default(10),
  superpixel_height: z.coerce.number().int().min(1).default(10),
  stroke_width: z.coerce.number().int().min(1).max(20).default(2),
  show_colors: z.coerce.boolean().default(true),
})

export type NumerateParams = z.infer<typeof numerateSchema>

export const numerateFilter = {
  id: "numerate",
  label: "Numerate",
  schema: numerateSchema,
} as const satisfies FilterDefinition<typeof numerateSchema>
