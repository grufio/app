/**
 * Trace registry types.
 *
 * The Trace surface (numerate, lineart) is the bitmap-to-vector
 * side of the editor — mutually exclusive (single active per
 * project), produces SVG. Sister to the Filter surface
 * (`lib/editor/filters/types`).
 *
 * For PR 1 of F21 the type aliases re-export the Filter surface's
 * shapes 1:1 — the structural difference (Trace's
 * `numerateSuperpixelWidth/_Height` render context fields, which
 * don't apply to bitmap filters) gets enforced once Trace gets
 * its own context type in PR 2 (when numerate / lineart move into
 * `lib/editor/trace/{numerate,lineart}` and stop sharing
 * `FilterRenderContext`).
 */
export type {
  FilterFieldKind as TraceFieldKind,
  FilterFieldUI as TraceFieldUI,
  FilterDialogMeta as TraceDialogMeta,
  FilterSelectOption as TraceSelectOption,
  FilterDefinition as TraceDefinition,
  FilterRenderContext as TraceRenderContext,
} from "@/lib/editor/filters/types"
