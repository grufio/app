/**
 * Pure state machine for the Filter dialog (`useFilterDialogSession`).
 *
 * Three phases:
 *   - `idle`        — dialog closed
 *   - `selecting`   — user opened "Add Filter", picking a type
 *   - `configuring` — user picked a type, filling parameters
 *
 * Lifted into its own module so the transitions are testable without
 * `renderHook`. The hook itself becomes a thin wrapper that dispatches
 * actions and exposes derived helpers.
 */
import type { RegisteredFilterId } from "@/lib/editor/filters/registry"

export type FilterType = RegisteredFilterId

export type FilterDialogSourceImage = {
  id: string
  width_px: number
  height_px: number
  signedUrl: string
}

export type FilterDialogSession = {
  sourceImageId: string
  sourceImageWidth: number
  sourceImageHeight: number
  sourceImageUrl: string
}

export type FilterDialogState =
  | { phase: "idle" }
  | { phase: "selecting"; session: FilterDialogSession }
  | { phase: "configuring"; session: FilterDialogSession; filterType: FilterType }

export type FilterDialogAction =
  | { type: "beginSelection"; session: FilterDialogSession }
  | { type: "closeSelection" }
  | { type: "selectFilterType"; filterType: FilterType }
  | { type: "closeConfigure" }
  | { type: "reset" }

export const initialFilterDialogState: FilterDialogState = { phase: "idle" }

export function toFilterDialogSession(image: FilterDialogSourceImage): FilterDialogSession {
  return {
    sourceImageId: image.id,
    sourceImageWidth: image.width_px,
    sourceImageHeight: image.height_px,
    sourceImageUrl: image.signedUrl,
  }
}

export function filterDialogReducer(
  state: FilterDialogState,
  action: FilterDialogAction,
): FilterDialogState {
  switch (action.type) {
    case "beginSelection":
      return { phase: "selecting", session: action.session }
    case "closeSelection":
      return { phase: "idle" }
    case "selectFilterType":
      if (state.phase !== "selecting") return state
      return { phase: "configuring", session: state.session, filterType: action.filterType }
    case "closeConfigure":
      return { phase: "idle" }
    case "reset":
      return { phase: "idle" }
    default: {
      const _exhaustive: never = action
      void _exhaustive
      return state
    }
  }
}
