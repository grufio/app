import { describe, expect, it } from "vitest"

import { shouldPersistCanvasTransform } from "./canvas-persistence-gate"

describe("shouldPersistCanvasTransform", () => {
  const master = "master-abc"
  const filterTip = "filter-xyz"
  const traceBase = "trace-base-123"

  it("permits the master image", () => {
    expect(
      shouldPersistCanvasTransform({
        canvasImageId: master,
        masterImageId: master,
        filterDisplayImageWithoutTraceId: filterTip,
      }),
    ).toBe(true)
  })

  it("permits the trace-free filter chain tip", () => {
    expect(
      shouldPersistCanvasTransform({
        canvasImageId: filterTip,
        masterImageId: master,
        filterDisplayImageWithoutTraceId: filterTip,
      }),
    ).toBe(true)
  })

  it("blocks trace_base — would otherwise corrupt master state", () => {
    expect(
      shouldPersistCanvasTransform({
        canvasImageId: traceBase,
        masterImageId: master,
        filterDisplayImageWithoutTraceId: filterTip,
      }),
    ).toBe(false)
  })

  it("blocks unknown canvas images (defensive)", () => {
    expect(
      shouldPersistCanvasTransform({
        canvasImageId: "some-other-id",
        masterImageId: master,
        filterDisplayImageWithoutTraceId: filterTip,
      }),
    ).toBe(false)
  })

  it("blocks when canvasImageId is null (canvas not ready)", () => {
    expect(
      shouldPersistCanvasTransform({
        canvasImageId: null,
        masterImageId: master,
        filterDisplayImageWithoutTraceId: filterTip,
      }),
    ).toBe(false)
  })

  it("blocks when masterImageId is null (project has no master)", () => {
    expect(
      shouldPersistCanvasTransform({
        canvasImageId: master,
        masterImageId: null,
        filterDisplayImageWithoutTraceId: filterTip,
      }),
    ).toBe(false)
  })

  it("permits the master even when no filter tip exists", () => {
    expect(
      shouldPersistCanvasTransform({
        canvasImageId: master,
        masterImageId: master,
        filterDisplayImageWithoutTraceId: null,
      }),
    ).toBe(true)
  })
})
