/**
 * Trace registry — bitmap-to-vector operations on the editor.
 *
 * Sister to `FILTER_REGISTRY` in `lib/editor/filters/registry.ts`;
 * the two share the same `FilterDefinition` shape but live on
 * separate surfaces (filter is stackable, trace is mutually
 * exclusive — one active per project).
 */
import { circulateTrace } from "./circulate"
import { linerateTrace } from "./linerate"
import { pixelateTrace } from "./pixelate"

export const TRACE_REGISTRY = {
  pixelate: pixelateTrace,
  circulate: circulateTrace,
  linerate: linerateTrace,
} as const

export type RegisteredTraceId = keyof typeof TRACE_REGISTRY
