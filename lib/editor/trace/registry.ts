/**
 * Trace registry — bitmap-to-vector operations on the editor.
 *
 * Sister to `FILTER_REGISTRY` in `lib/editor/filters/registry.ts`;
 * the two share the same `FilterDefinition` shape but live on
 * separate surfaces (filter is stackable, trace is mutually
 * exclusive — one active per project).
 */
import { lineartTrace } from "./lineart"
import { numerateTrace } from "./numerate"

export const TRACE_REGISTRY = {
  numerate: numerateTrace,
  lineart: lineartTrace,
} as const

export type RegisteredTraceId = keyof typeof TRACE_REGISTRY
