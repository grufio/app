/**
 * Editor service: artboard padding rules (UI-agnostic).
 *
 * Responsibilities:
 * - Normalize persisted workspace padding (µpx-as-text) into safe values.
 * - Clamp each side to [0, MAX_PX_U]. Keeps the hook/canvas thin.
 */
import type { WorkspaceRow } from "@/lib/editor/project-workspace"
import { MAX_PX_U } from "@/lib/editor/units"

export type WorkspacePaddingPxU = {
  topPxU: string
  bottomPxU: string
  leftPxU: string
  rightPxU: string
}

/** Parse a µpx-as-text value and clamp it to [0, MAX_PX_U]; returns a string. */
export function clampPaddingPxU(value: unknown): string {
  let n: bigint
  try {
    n = BigInt(typeof value === "string" && value.trim() ? value.trim() : "0")
  } catch {
    n = 0n
  }
  if (n < 0n) n = 0n
  if (n > MAX_PX_U) n = MAX_PX_U
  return n.toString()
}

export function normalizeWorkspacePadding(workspaceRow: WorkspaceRow | null): WorkspacePaddingPxU {
  if (!workspaceRow) {
    return { topPxU: "0", bottomPxU: "0", leftPxU: "0", rightPxU: "0" }
  }
  return {
    topPxU: clampPaddingPxU(workspaceRow.padding_top_px_u),
    bottomPxU: clampPaddingPxU(workspaceRow.padding_bottom_px_u),
    leftPxU: clampPaddingPxU(workspaceRow.padding_left_px_u),
    rightPxU: clampPaddingPxU(workspaceRow.padding_right_px_u),
  }
}
