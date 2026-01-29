/**
 * Konva adapter exports (barrel).
 *
 * Responsibilities:
 * - Expose typed helpers for reading/writing µpx-based transforms on Konva-like nodes.
 */
export type { PositionNodeLike, SizeNodeLike } from "@/lib/editor/konva/bakein"
export {
  applyMicroPxPositionToNode,
  applyMicroPxToNode,
  bakeInSizeToMicroPx,
  clampMicroPx,
  numberToMicroPx,
  readMicroPxPositionFromNode,
} from "@/lib/editor/konva/bakein"

