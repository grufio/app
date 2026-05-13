/**
 * Editor readiness gates.
 *
 * Responsibilities:
 * - Compute when workspace/image state is ready to drive UI and commits.
 * - Centralize “is ready” logic to avoid drift across components.
 */
export function computeWorkspaceReady(opts: {
  workspaceLoading: boolean
  workspaceUnit: unknown
}) {
  const { workspaceLoading, workspaceUnit } = opts
  return (
    !workspaceLoading &&
    Boolean(workspaceUnit)
  )
}

export function computeImagePanelReady(opts: {
  workspaceReady: boolean
  masterImage: unknown
  panelImagePxU: { w: bigint; h: bigint } | null
}) {
  const { workspaceReady, masterImage, panelImagePxU } = opts
  return (
    workspaceReady &&
    Boolean(masterImage) &&
    Boolean(panelImagePxU && panelImagePxU.w > 0n && panelImagePxU.h > 0n)
  )
}

