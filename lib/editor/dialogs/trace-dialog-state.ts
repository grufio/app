/**
 * Pure state machine for the Trace dialog (`useTraceDialogSession`).
 *
 * Mirror of `filter-dialog-state.ts` — same three phases (idle /
 * selecting / configuring). Lives in its own module because Trace is
 * a different surface with a different "kind" set, but the lifecycle
 * is identical and the user's mental model expects the two to behave
 * the same way.
 */
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"

export type TraceKind = RegisteredTraceId

export type TraceDialogSourceImage = {
  id: string
  width_px: number
  height_px: number
  signedUrl: string
  /** Displayed size of the image on the artboard, in millimetres.
   * Numerate-trace grid math is driven by this — what the user sees
   * is what gets traced (less the cropped border). The shell computes
   * it from `project_image_state` (live µpx, fix-72 internal mapping),
   * with a fresh-upload fallback via `computeImagePlacementPx`. */
  displayMmW: number
  displayMmH: number
}

export type TraceDialogSession = {
  sourceImageId: string
  sourceImageWidth: number
  sourceImageHeight: number
  sourceImageUrl: string
  displayMmW: number
  displayMmH: number
}

export type TraceDialogState =
  | { phase: "idle" }
  | { phase: "selecting"; session: TraceDialogSession }
  | { phase: "configuring"; session: TraceDialogSession; kind: TraceKind }

export type TraceDialogAction =
  | { type: "beginSelection"; session: TraceDialogSession }
  | { type: "closeSelection" }
  | { type: "selectKind"; kind: TraceKind }
  | { type: "closeConfigure" }
  | { type: "reset" }

export const initialTraceDialogState: TraceDialogState = { phase: "idle" }

export function toTraceDialogSession(image: TraceDialogSourceImage): TraceDialogSession {
  return {
    sourceImageId: image.id,
    sourceImageWidth: image.width_px,
    sourceImageHeight: image.height_px,
    sourceImageUrl: image.signedUrl,
    displayMmW: image.displayMmW,
    displayMmH: image.displayMmH,
  }
}

export function traceDialogReducer(
  state: TraceDialogState,
  action: TraceDialogAction,
): TraceDialogState {
  switch (action.type) {
    case "beginSelection":
      return { phase: "selecting", session: action.session }
    case "closeSelection":
      if (state.phase === "idle") return state
      return { phase: "idle" }
    case "selectKind":
      if (state.phase !== "selecting") return state
      return { phase: "configuring", session: state.session, kind: action.kind }
    case "closeConfigure":
      if (state.phase === "idle") return state
      return { phase: "idle" }
    case "reset":
      if (state.phase === "idle") return state
      return { phase: "idle" }
    default: {
      const _exhaustive: never = action
      void _exhaustive
      return state
    }
  }
}
