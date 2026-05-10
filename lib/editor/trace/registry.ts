/**
 * Trace registry — bitmap-to-vector operations on the editor.
 *
 * Sister to `FILTER_REGISTRY` in `lib/editor/filters/registry.ts`;
 * the two share the same `FilterDefinition` shape but live on
 * separate surfaces (filter is stackable, trace is mutually
 * exclusive). PR 1 of F21 is strictly additive: numerate and
 * lineart still live in `lib/editor/filters/` so the legacy
 * Filter dialog keeps working until PR 2 lands the new Trace tab
 * and physically moves the files.
 */
import { lineartFilter } from "@/lib/editor/filters/lineart"
import { numerateFilter } from "@/lib/editor/filters/numerate"

export const TRACE_REGISTRY = {
  numerate: numerateFilter,
  lineart: lineartFilter,
} as const

export type RegisteredTraceId = keyof typeof TRACE_REGISTRY
