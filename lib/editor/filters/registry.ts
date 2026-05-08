import { lineartFilter } from "./lineart"
import { numerateFilter } from "./numerate"
import { pixelateFilter } from "./pixelate"

export const FILTER_REGISTRY = {
  pixelate: pixelateFilter,
  lineart: lineartFilter,
  numerate: numerateFilter,
} as const

export type RegisteredFilterId = keyof typeof FILTER_REGISTRY
