// @vitest-environment jsdom
import { renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { WorkflowSourceSnapshot } from "@/lib/editor/machines/image-workflow.types"

import { useCanvasDerivedState } from "./use-canvas-derived-state"

const WORKING_COPY_ID = "wc-id"
const FILTER_TIP_URL = "https://signed.test/filter-tip.png"
const MASTER_URL = "https://signed.test/master.png"

const editorImageSource: WorkflowSourceSnapshot = {
  status: "ready",
  image: {
    id: WORKING_COPY_ID,
    signedUrl: FILTER_TIP_URL,
    width_px: 800,
    height_px: 600,
    name: "working-copy",
  },
  error: "",
}

const filterDisplayImage = {
  id: WORKING_COPY_ID,
  signedUrl: FILTER_TIP_URL,
  width_px: 800,
  height_px: 600,
  name: "filter-tip",
}

// Defaults represent the "happy desktop, no toggles touched" baseline.
// Each test overrides only the inputs that drive its assertion — keeps
// the suite resilient to future hook-input additions (add the default
// in one place, no test churn).
const baseArgs = {
  leftPanelTab: "image" as const,
  editorImageSource,
  filterDisplayImage,
  filterDisplayImageWithoutTrace: filterDisplayImage,
  mobileSection: "artboard" as const,
  isMobile: false,
  masterSignedUrl: MASTER_URL,
  traceOverlayVisible: true,
  previewBitmapVisible: true,
  numbersLayerVisible: true,
}

// Integration guard for the bug class that PR #354 shipped without
// catching: the picker (`pickCanvasImage`) was unit-tested with
// synthetic URLs in isolation, but the shell's wiring fed it the
// **active** image URL under the name `masterSignedUrl`. The swap
// to "master URL" silently became a no-op once a filter was applied
// (filter URL → filter URL). The hook test below exercises the full
// chain from "we have a master URL distinct from the filter URL" to
// "canvas exposes the master URL", on both desktop and mobile.
describe("useCanvasDerivedState — Image/Artboard section surfaces master URL", () => {
  it("desktop Image tab: canvas signedUrl swaps to master, ID stays on working copy", () => {
    const { result } = renderHook(() => useCanvasDerivedState(baseArgs))
    expect(result.current.canvasImage?.signedUrl).toBe(MASTER_URL)
    // ID stays on the working copy so persistence keeps targeting the
    // right row (`useDisplaySize` invariant).
    expect(result.current.canvasImage?.id).toBe(WORKING_COPY_ID)
  })

  it("mobile Artboard section: canvas signedUrl swaps to master, ID stays on working copy", () => {
    const { result } = renderHook(() =>
      useCanvasDerivedState({ ...baseArgs, isMobile: true }),
    )
    expect(result.current.canvasImage?.signedUrl).toBe(MASTER_URL)
    expect(result.current.canvasImage?.id).toBe(WORKING_COPY_ID)
  })

  it("desktop Filter tab: canvas keeps the working-copy URL (filter tip), no override", () => {
    const { result } = renderHook(() =>
      useCanvasDerivedState({ ...baseArgs, leftPanelTab: "filter" }),
    )
    expect(result.current.canvasImage?.signedUrl).toBe(FILTER_TIP_URL)
    expect(result.current.showFilterChain).toBe(true)
  })

  it("Image tab with null master URL: gracefully falls back to working-copy URL (partial-boot)", () => {
    // When the master sign fails server-side, the API returns
    // masterSignedUrl: "" → shell passes null → pickCanvasImage skips
    // the override. Visual = pre-PR-#354 behaviour, no crash.
    const { result } = renderHook(() =>
      useCanvasDerivedState({ ...baseArgs, masterSignedUrl: null }),
    )
    expect(result.current.canvasImage?.signedUrl).toBe(FILTER_TIP_URL)
    expect(result.current.canvasImage?.id).toBe(WORKING_COPY_ID)
  })
})

// Integration guard for the bug where the Trace tab's view toggles
// leaked into the Image / Filter tabs: `previewBitmapVisible=false`
// on Trace tab → bitmap hidden on every tab. The fix gates the
// canvas effect on the Trace section being active; checkbox UI keeps
// reading the raw session values (so the user's last preference
// survives a tab trip).
describe("useCanvasDerivedState — Trace view flags are Trace-section-scoped", () => {
  it("desktop Image tab: hook returns effective flags = true even when session flags are all false", () => {
    const { result } = renderHook(() =>
      useCanvasDerivedState({
        ...baseArgs,
        leftPanelTab: "image",
        traceOverlayVisible: false,
        previewBitmapVisible: false,
        numbersLayerVisible: false,
      }),
    )
    expect(result.current.traceOverlayVisible).toBe(true)
    expect(result.current.previewBitmapVisible).toBe(true)
    expect(result.current.numbersLayerVisible).toBe(true)
  })

  it("desktop Filter tab: hook returns effective flags = true even when session flags are all false", () => {
    const { result } = renderHook(() =>
      useCanvasDerivedState({
        ...baseArgs,
        leftPanelTab: "filter",
        traceOverlayVisible: false,
        previewBitmapVisible: false,
        numbersLayerVisible: false,
      }),
    )
    expect(result.current.traceOverlayVisible).toBe(true)
    expect(result.current.previewBitmapVisible).toBe(true)
    expect(result.current.numbersLayerVisible).toBe(true)
  })

  it("desktop Trace tab: hook returns session flag values unchanged", () => {
    const { result } = renderHook(() =>
      useCanvasDerivedState({
        ...baseArgs,
        leftPanelTab: "trace",
        traceOverlayVisible: false,
        previewBitmapVisible: false,
        numbersLayerVisible: false,
      }),
    )
    expect(result.current.traceOverlayVisible).toBe(false)
    expect(result.current.previewBitmapVisible).toBe(false)
    expect(result.current.numbersLayerVisible).toBe(false)
  })

  it("mobile artboard section: hook returns effective flags = true even when session flags are all false", () => {
    const { result } = renderHook(() =>
      useCanvasDerivedState({
        ...baseArgs,
        isMobile: true,
        mobileSection: "artboard",
        // Desktop tab value irrelevant when isMobile=true.
        leftPanelTab: "trace",
        traceOverlayVisible: false,
        previewBitmapVisible: false,
        numbersLayerVisible: false,
      }),
    )
    expect(result.current.traceOverlayVisible).toBe(true)
    expect(result.current.previewBitmapVisible).toBe(true)
    expect(result.current.numbersLayerVisible).toBe(true)
  })

  it("mobile trace section: hook returns session flag values unchanged", () => {
    const { result } = renderHook(() =>
      useCanvasDerivedState({
        ...baseArgs,
        isMobile: true,
        mobileSection: "trace",
        leftPanelTab: "image",
        traceOverlayVisible: false,
        previewBitmapVisible: false,
        numbersLayerVisible: false,
      }),
    )
    expect(result.current.traceOverlayVisible).toBe(false)
    expect(result.current.previewBitmapVisible).toBe(false)
    expect(result.current.numbersLayerVisible).toBe(false)
  })
})
