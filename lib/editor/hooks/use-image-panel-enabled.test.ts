import { describe, expect, it } from "vitest"

import { computeImagePanelEnabled } from "./use-image-panel-enabled"

const ready = {
  hasMasterImage: true,
  imageStateLoading: false,
  workspaceReady: true,
  imagePanelLocked: false,
} as const

describe("computeImagePanelEnabled", () => {
  it("enabled when all preconditions satisfied", () => {
    expect(computeImagePanelEnabled(ready)).toEqual({ enabled: true })
  })

  it("disabled with reason 'no-image' when master image missing", () => {
    expect(computeImagePanelEnabled({ ...ready, hasMasterImage: false })).toEqual({
      enabled: false,
      reason: "no-image",
    })
  })

  it("disabled with reason 'loading-state' when image state loading", () => {
    expect(computeImagePanelEnabled({ ...ready, imageStateLoading: true })).toEqual({
      enabled: false,
      reason: "loading-state",
    })
  })

  it("disabled with reason 'workspace-not-ready' when workspace not ready", () => {
    expect(computeImagePanelEnabled({ ...ready, workspaceReady: false })).toEqual({
      enabled: false,
      reason: "workspace-not-ready",
    })
  })

  it("disabled with reason 'image-locked' when panel locked", () => {
    expect(computeImagePanelEnabled({ ...ready, imagePanelLocked: true })).toEqual({
      enabled: false,
      reason: "image-locked",
    })
  })

  it("returns the FIRST applicable reason in priority order", () => {
    // No image takes precedence over loading.
    expect(
      computeImagePanelEnabled({
        ...ready,
        hasMasterImage: false,
        imageStateLoading: true,
      }),
    ).toEqual({ enabled: false, reason: "no-image" })
  })
})
