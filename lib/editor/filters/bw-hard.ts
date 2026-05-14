import { z } from "zod"

import type { FilterDefinition } from "./types"

/**
 * High-contrast black-and-white filter (Inkwell-style): deep blacks,
 * blown highlights. No user-configurable params — the look is a fixed
 * preset. The actual pixel pipeline (Rec.709 luma → gamma → contrast)
 * lives in the Python filter-service `/filters/bw_hard` route.
 */
export const bwHardSchema = z.object({}).strict()

export type BwHardParams = z.infer<typeof bwHardSchema>

export const bwHardFilter: FilterDefinition<typeof bwHardSchema> = {
  id: "bw_hard",
  label: "B&W Hard",
  schema: bwHardSchema,
  meta: {
    title: "B&W Hard",
    description: "High-contrast black & white.",
  },
}
