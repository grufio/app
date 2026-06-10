"use client"

import { computeImagePanelReady, computeWorkspaceReady } from "@/lib/editor/editor-ready"
import type { Unit } from "@/lib/editor/units"

/**
 * Image-panel readiness + display-transform projection used by the
 * artboard surface sheet. Trimmed from the (deleted) right-panel
 * model: the nav-tree routing (`activeRightSection`) and the
 * selected-image meta (`panelImageMeta`) went with the side panels.
 */
export function useRightPanelModel(args: {
  /** The single authoritative display transform (Invariant 1). The panel
   * px readout reads this one source — no `imageTxU ?? initialImageTxU`
   * fallback chain (a second display surface of the old bug class). */
  displayTxU: { x: bigint; y: bigint; w: bigint; h: bigint } | null
  workspaceLoading: boolean
  workspaceUnit: Unit | null
  masterImage: { signedUrl?: string | null; name?: string | null } | null
}) {
  const { displayTxU, workspaceLoading, workspaceUnit, masterImage } = args

  const panelImageTxU = displayTxU

  const workspaceReady = computeWorkspaceReady({
    workspaceLoading,
    workspaceUnit,
  })

  const imagePanelReady = computeImagePanelReady({
    workspaceReady,
    masterImage,
    panelImagePxU: panelImageTxU ? { w: panelImageTxU.w, h: panelImageTxU.h } : null,
  })

  return {
    panelImageTxU,
    workspaceReady,
    imagePanelReady,
  }
}
