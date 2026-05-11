/**
 * Filter working-copy service module.
 *
 * Two entry points used by the API + tests:
 *   - `getOrCreateFilterWorkingCopy` — ensures a per-project working
 *     bitmap exists for the filter chain to operate on
 *   - `getFilterPanelData` — returns the canvas display payload
 *     (trace-aware + trace-free) plus the filter sidebar stack
 *
 * Implementation is split per concern in sibling files; this index
 * is the stable import surface.
 */
export { getOrCreateFilterWorkingCopy } from "./get-or-create"
export { getFilterPanelData } from "./get-panel-data"
export type {
  FailStage,
  Failure,
  FilterPanelDataResult,
  FilterPanelDisplay,
  FilterPanelStackItem,
  FilterWorkingCopyResult,
  Success,
} from "./types"
