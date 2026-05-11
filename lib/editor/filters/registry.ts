import { pixelateFilter } from "./pixelate"

export const FILTER_REGISTRY = {
  pixelate: pixelateFilter,
} as const

export type RegisteredFilterId = keyof typeof FILTER_REGISTRY
