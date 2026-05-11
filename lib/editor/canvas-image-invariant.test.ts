import { describe, expect, it } from "vitest"

import {
  deriveStageImage,
  pickCanvasImage,
  type CanvasImage,
  type CanvasSource,
} from "./canvas-image-invariant"

const workingCopy: CanvasSource = {
  id: "working-copy-id",
  signedUrl: "https://example.test/wc.png",
  name: "working-copy",
  width_px: 800,
  height_px: 600,
}

const stageFromWorking: CanvasImage = {
  id: workingCopy.id,
  signedUrl: workingCopy.signedUrl,
  name: workingCopy.name,
  width_px: workingCopy.width_px,
  height_px: workingCopy.height_px,
  dpi: null,
  restore_base: null,
}

describe("deriveStageImage", () => {
  it("returns null when the source is loading", () => {
    expect(
      deriveStageImage({ editorImageSourceStatus: "loading", editorImageSourceImage: null }),
    ).toBeNull()
  })

  it("returns null when the source is empty", () => {
    expect(
      deriveStageImage({ editorImageSourceStatus: "empty", editorImageSourceImage: null }),
    ).toBeNull()
  })

  it("returns null when status is ready but image is missing (defensive)", () => {
    expect(
      deriveStageImage({ editorImageSourceStatus: "ready", editorImageSourceImage: null }),
    ).toBeNull()
  })

  it("maps the ready source image to canvas shape", () => {
    expect(
      deriveStageImage({ editorImageSourceStatus: "ready", editorImageSourceImage: workingCopy }),
    ).toEqual(stageFromWorking)
  })
})

describe("pickCanvasImage — invariant: canvas source is always the working-copy", () => {
  it("returns the working-copy when filterDisplayImageWithoutTrace is set", () => {
    expect(
      pickCanvasImage({
        filterDisplayImageWithoutTrace: workingCopy,
        stageImage: stageFromWorking,
      })?.id,
    ).toBe(workingCopy.id)
  })

  it("falls back to stageImage when the working-copy is missing (still loading)", () => {
    expect(
      pickCanvasImage({
        filterDisplayImageWithoutTrace: null,
        stageImage: stageFromWorking,
      })?.id,
    ).toBe(stageFromWorking.id)
  })

  it("returns null when both inputs are null", () => {
    expect(
      pickCanvasImage({
        filterDisplayImageWithoutTrace: null,
        stageImage: null,
      }),
    ).toBeNull()
  })

  it("does not honor a stale stageImage when a fresh working-copy is available", () => {
    const staleStage: CanvasImage = { ...stageFromWorking, id: "stale-id" }
    expect(
      pickCanvasImage({
        filterDisplayImageWithoutTrace: workingCopy,
        stageImage: staleStage,
      })?.id,
    ).toBe(workingCopy.id)
  })
})
