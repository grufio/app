import { describe, expect, it } from "vitest"

import { computeImagePanelEnabled } from "./use-image-panel-enabled"

const ready = {
  hasMasterImage: true,
  workspaceReady: true,
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

  it("disabled with reason 'workspace-not-ready' when workspace not ready", () => {
    expect(computeImagePanelEnabled({ ...ready, workspaceReady: false })).toEqual({
      enabled: false,
      reason: "workspace-not-ready",
    })
  })

  it("returns the FIRST applicable reason in priority order", () => {
    // No image takes precedence over workspace-not-ready.
    expect(
      computeImagePanelEnabled({
        hasMasterImage: false,
        workspaceReady: false,
      }),
    ).toEqual({ enabled: false, reason: "no-image" })
  })
})
