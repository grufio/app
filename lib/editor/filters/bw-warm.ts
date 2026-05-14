import { z } from "zod"

import type { FilterDefinition } from "./types"

/**
 * Warm-toned black-and-white filter (Willow-style): fully desaturated,
 * then re-tinted warm. No user-configurable params. The pixel
 * pipeline (Rec.709 luma → warm tint matrix) lives in the Python
 * filter-service `/filters/bw_warm` route.
 */
export const bwWarmSchema = z.object({}).strict()

export type BwWarmParams = z.infer<typeof bwWarmSchema>

export const bwWarmFilter: FilterDefinition<typeof bwWarmSchema> = {
  id: "bw_warm",
  label: "B&W Warm",
  schema: bwWarmSchema,
  meta: {
    title: "B&W Warm",
    description: "Warm-toned black & white.",
  },
}
