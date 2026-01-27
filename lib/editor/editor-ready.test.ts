import { describe, expect, test } from "vitest"

import { computeImagePanelReady, computeWorkspaceReady } from "./editor-ready"

describe("computeWorkspaceReady", () => {
  test("false while loading", () => {
    expect(
      computeWorkspaceReady({
        workspaceLoading: true,
        workspaceUnit: "cm",
        workspaceDpi: 300,
      })
    ).toBe(false)
  })

  test("false without unit", () => {
    expect(
      computeWorkspaceReady({
        workspaceLoading: false,
        workspaceUnit: null,
        workspaceDpi: 300,
      })
    ).toBe(false)
  })

  test("false with invalid dpi", () => {
    expect(
      computeWorkspaceReady({
        workspaceLoading: false,
        workspaceUnit: "cm",
        workspaceDpi: "nope",
      })
    ).toBe(false)
  })

  test("true with unit and positive finite dpi", () => {
    expect(
      computeWorkspaceReady({
        workspaceLoading: false,
        workspaceUnit: "cm",
        workspaceDpi: 300,
      })
    ).toBe(true)
  })
})

describe("computeImagePanelReady", () => {
  test("false if not workspaceReady", () => {
    expect(
      computeImagePanelReady({
        workspaceReady: false,
        masterImage: { name: "x" },
        imageStateLoading: false,
        panelImagePxU: { w: 1n, h: 1n },
      })
    ).toBe(false)
  })

  test("false if loading image state", () => {
    expect(
      computeImagePanelReady({
        workspaceReady: true,
        masterImage: { name: "x" },
        imageStateLoading: true,
        panelImagePxU: { w: 1n, h: 1n },
      })
    ).toBe(false)
  })

  test("false if missing panel size", () => {
    expect(
      computeImagePanelReady({
        workspaceReady: true,
        masterImage: { name: "x" },
        imageStateLoading: false,
        panelImagePxU: null,
      })
    ).toBe(false)
  })

  test("false if size is non-positive", () => {
    expect(
      computeImagePanelReady({
        workspaceReady: true,
        masterImage: { name: "x" },
        imageStateLoading: false,
        panelImagePxU: { w: 0n, h: 1n },
      })
    ).toBe(false)
  })

  test("true if all conditions satisfied", () => {
    expect(
      computeImagePanelReady({
        workspaceReady: true,
        masterImage: { name: "x" },
        imageStateLoading: false,
        panelImagePxU: { w: 100n, h: 200n },
      })
    ).toBe(true)
  })
})

