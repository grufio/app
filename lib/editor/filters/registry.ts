import { bwHardFilter } from "./bw-hard"
import { bwSoftFilter } from "./bw-soft"
import { bwWarmFilter } from "./bw-warm"

export const FILTER_REGISTRY = {
  bw_hard: bwHardFilter,
  bw_soft: bwSoftFilter,
  bw_warm: bwWarmFilter,
} as const

export type RegisteredFilterId = keyof typeof FILTER_REGISTRY
