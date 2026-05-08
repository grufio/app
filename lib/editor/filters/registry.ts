import { lineartFilter } from "./lineart"
import { pixelateFilter } from "./pixelate"

export const FILTER_REGISTRY = {
  pixelate: pixelateFilter,
  lineart: lineartFilter,
} as const

export type RegisteredFilterId = keyof typeof FILTER_REGISTRY
