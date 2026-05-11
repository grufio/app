"use client"

/**
 * Compute the Image-Panel disabled flag + a human-readable reason.
 *
 * Centralises the 3-way OR that used to live inline in
 * ProjectEditorRightPanel.tsx:
 *
 *   disabled={
 *     !masterImage ||
 *     imageStateLoading ||
 *     !workspaceReady
 *   }
 *
 * Each disabled state has a different cause; the `reason` field lets a
 * caller surface a tooltip (or just log) why the panel is disabled.
 */

export type ImagePanelEnabledArgs = {
  hasMasterImage: boolean
  imageStateLoading: boolean
  workspaceReady: boolean
}

export type ImagePanelEnabledResult = {
  enabled: boolean
  /** When disabled, a short human-readable reason. */
  reason?: "no-image" | "loading-state" | "workspace-not-ready"
}

export function computeImagePanelEnabled(args: ImagePanelEnabledArgs): ImagePanelEnabledResult {
  if (!args.hasMasterImage) return { enabled: false, reason: "no-image" }
  if (args.imageStateLoading) return { enabled: false, reason: "loading-state" }
  if (!args.workspaceReady) return { enabled: false, reason: "workspace-not-ready" }
  return { enabled: true }
}

/**
 * React-friendly wrapper. Pure compute — no hook state or effects.
 * Kept as a hook for symmetry with sibling hooks and so future
 * additions (e.g. memoization, debug telemetry) are non-breaking.
 */
export function useImagePanelEnabled(args: ImagePanelEnabledArgs): ImagePanelEnabledResult {
  return computeImagePanelEnabled(args)
}
