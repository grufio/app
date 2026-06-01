// @vitest-environment jsdom
import { renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { WorkflowSourceSnapshot } from "@/lib/editor/machines/image-workflow.types"

import { useCanvasDerivedState } from "./use-canvas-derived-state"

// Integration guard for the bug class that PR #354 shipped without
// catching: the picker (`pickCanvasImage`) was unit-tested with
// synthetic URLs in isolation, but the shell's wiring fed it the
// **active** image URL under the name `masterSignedUrl`. The swap
// to "master URL" silently became a no-op once a filter was applied
// (filter URL → filter URL). The hook test below exercises the full
// chain from "we have a master URL distinct from the filter URL" to
// "canvas exposes the master URL", on both desktop and mobile.
describe("useCanvasDerivedState — Image/Artboard section surfaces master URL", () => {
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

  it("desktop Image tab: canvas signedUrl swaps to master, ID stays on working copy", () => {
    const { result } = renderHook(() =>
      useCanvasDerivedState({
        leftPanelTab: "image",
        editorImageSource,
        filterDisplayImage,
        filterDisplayImageWithoutTrace: filterDisplayImage,
        mobileSection: "artboard",
        isMobile: false,
        masterSignedUrl: MASTER_URL,
      }),
    )

    expect(result.current.canvasImage?.signedUrl).toBe(MASTER_URL)
    // ID stays on the working copy so persistence keeps targeting the
    // right row (`useDisplaySize` invariant).
    expect(result.current.canvasImage?.id).toBe(WORKING_COPY_ID)
  })

  it("mobile Artboard section: canvas signedUrl swaps to master, ID stays on working copy", () => {
    const { result } = renderHook(() =>
      useCanvasDerivedState({
        leftPanelTab: "image",
        editorImageSource,
        filterDisplayImage,
        filterDisplayImageWithoutTrace: filterDisplayImage,
        mobileSection: "artboard",
        isMobile: true,
        masterSignedUrl: MASTER_URL,
      }),
    )

    expect(result.current.canvasImage?.signedUrl).toBe(MASTER_URL)
    expect(result.current.canvasImage?.id).toBe(WORKING_COPY_ID)
  })

  it("desktop Filter tab: canvas keeps the working-copy URL (filter tip), no override", () => {
    const { result } = renderHook(() =>
      useCanvasDerivedState({
        leftPanelTab: "filter",
        editorImageSource,
        filterDisplayImage,
        filterDisplayImageWithoutTrace: filterDisplayImage,
        mobileSection: "artboard",
        isMobile: false,
        masterSignedUrl: MASTER_URL,
      }),
    )

    expect(result.current.canvasImage?.signedUrl).toBe(FILTER_TIP_URL)
    expect(result.current.showFilterChain).toBe(true)
  })

  it("Image tab with null master URL: gracefully falls back to working-copy URL (partial-boot)", () => {
    // When the master sign fails server-side, the API returns
    // masterSignedUrl: "" → shell passes null → pickCanvasImage skips
    // the override. Visual = pre-PR-#354 behaviour, no crash.
    const { result } = renderHook(() =>
      useCanvasDerivedState({
        leftPanelTab: "image",
        editorImageSource,
        filterDisplayImage,
        filterDisplayImageWithoutTrace: filterDisplayImage,
        mobileSection: "artboard",
        isMobile: false,
        masterSignedUrl: null,
      }),
    )

    expect(result.current.canvasImage?.signedUrl).toBe(FILTER_TIP_URL)
    expect(result.current.canvasImage?.id).toBe(WORKING_COPY_ID)
  })
})
