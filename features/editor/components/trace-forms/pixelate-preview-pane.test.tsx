/**
 * @vitest-environment jsdom
 *
 * Component test for PixelatePreviewPane.
 *
 * jsdom can't render the canvas content, so we only assert the
 * React/JSX wiring: the canvas bitmap is sized to the source-crop
 * resolution (not cellsX × cellsY) and the canvas remounts (cleanly)
 * after the source image loads.
 */
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/editor/trace/pixelate-preview", () => ({
  buildMiniCanvas: () => {
    /* noop in jsdom */
  },
}))

// The pane snaps cells to the DB palette via `/api/palette`; jsdom has no
// server, so stub the hook to its loading state (null → raw-means fallback).
// These tests assert bitmap attrs + zoom, neither of which needs the palette.
vi.mock("@/lib/editor/trace/use-trace-palette", () => ({
  useTracePalette: () => null,
}))

import { pixelateSchema, type PixelateParams } from "@/lib/editor/trace/pixelate"
import { FakeImage, FakeResizeObserver } from "@/lib/test/jsdom-stubs"
import { PixelatePreviewPane } from "./pixelate-preview-pane"

const defaults = pixelateSchema.parse({}) as PixelateParams

// The pane uses a ResizeObserver to measure itself; a no-op stub is enough
// here — these tests assert bitmap attrs + zoom state, neither of which
// depends on the measured pane size (it stays 0 in jsdom).
describe("PixelatePreviewPane", () => {
  beforeEach(() => {
    vi.stubGlobal("Image", FakeImage)
    vi.stubGlobal("ResizeObserver", FakeResizeObserver)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("renders the mini canvas at source-crop resolution (not cellsX × cellsY)", async () => {
    const { getByTestId } = render(
      <PixelatePreviewPane
        sourceImageUrl="https://example.test/a.png"
        displayMmW={100}
        displayMmH={75}
        params={defaults}
      />,
    )

    // FakeImage is 100×75 naturalWidth/Height. usedMm 96×72 → crop in
    // source px = 96 × (100/100) = 96, 72 × (75/75) = 72. Canvas
    // bitmap mirrors that crop, not cellsX × cellsY (16 × 12).
    await waitFor(() => {
      const canvas = getByTestId("pixelate-preview-mini") as HTMLCanvasElement
      expect(canvas.getAttribute("width")).toBe("96")
      expect(canvas.getAttribute("height")).toBe("72")
    })
  })

  it("falls back to 1×1 bitmap when grid would be invalid", () => {
    // 4 mm image with 5 mm supercell → cellsX=0, invalid grid, crop=null.
    const { getByTestId } = render(
      <PixelatePreviewPane
        sourceImageUrl="https://example.test/a.png"
        displayMmW={4}
        displayMmH={4}
        params={{ ...defaults, supercell_width_mm: 5, supercell_height_mm: 5 }}
      />,
    )
    const canvas = getByTestId("pixelate-preview-mini") as HTMLCanvasElement
    expect(canvas.getAttribute("width")).toBe("1")
    expect(canvas.getAttribute("height")).toBe("1")
  })

  it("zoom controls update the displayed zoom label and step ranges", async () => {
    const { getByTestId, getByLabelText, queryByTestId } = render(
      <PixelatePreviewPane
        sourceImageUrl="https://example.test/a.png"
        displayMmW={100}
        displayMmH={75}
        params={defaults}
      />,
    )

    // Zoom controls appear after the source image loads.
    await waitFor(() => {
      expect(queryByTestId("pixelate-preview-zoom-controls")).not.toBeNull()
    })

    const label = () => getByTestId("pixelate-preview-zoom-label").textContent

    // Default: 100% (= fit-to-pane). Zoom out is disabled at floor.
    expect(label()).toBe("100%")
    expect((getByLabelText("Zoom out") as HTMLButtonElement).disabled).toBe(true)

    // Step up via Zoom in (×1.5 → 150%).
    await act(async () => {
      fireEvent.click(getByLabelText("Zoom in"))
    })
    expect(label()).toBe("150%")

    // Fit returns to 100%.
    await act(async () => {
      fireEvent.click(getByLabelText("Fit"))
    })
    expect(label()).toBe("100%")
  })
})
