/**
 * @vitest-environment jsdom
 *
 * Component test for CirculatePreviewPane. jsdom can't render canvas content,
 * so we assert the React/JSX wiring: the canvas bitmap is sized to the
 * source-crop resolution and the zoom controls drive the zoom label. The
 * renderer + palette hook are stubbed (no canvas, no network in jsdom).
 */
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/editor/trace/circulate-preview", () => ({
  // Pane now consumes the decomposed pipeline; all stages no-op in jsdom.
  restrictOuterPalette: (args: { palette: unknown }) => args.palette,
  snapAndDitherOuter: () => null,
  applyTopNReductionOuter: () => null,
  snapInnerCells: () => null,
  paintCirculateCells: () => {
    /* noop in jsdom */
  },
}))

// The pixelate-preview stage helpers (readSourceCells + applyTextureStep)
// are also reused by the circulate pane; mock them the same way.
vi.mock("@/lib/editor/trace/pixelate-preview", () => ({
  readSourceCells: () => null,
  applyTextureStep: () => null,
}))

vi.mock("@/lib/editor/trace/use-trace-palette", () => ({
  useTracePalette: () => null,
}))

import { circulateSchema, type CirculateParams } from "@/lib/editor/trace/circulate"
import { FakeImage, FakeResizeObserver } from "@/lib/test/jsdom-stubs"
import { CirculatePreviewPane } from "./circulate-preview-pane"

const defaults = circulateSchema.parse({}) as CirculateParams

describe("CirculatePreviewPane", () => {
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
      <CirculatePreviewPane
        sourceImageUrl="https://example.test/a.png"
        displayMmW={100}
        displayMmH={75}
        params={defaults}
      />,
    )
    // FakeImage is 100×75. usedMm 96×72 (pitch 6 → 16×12 cells) → crop in
    // source px = 96 × (100/100) = 96, 72 × (75/75) = 72.
    await waitFor(() => {
      const canvas = getByTestId("circulate-preview-mini") as HTMLCanvasElement
      expect(canvas.getAttribute("width")).toBe("96")
      expect(canvas.getAttribute("height")).toBe("72")
    })
  })

  it("falls back to a 1×1 bitmap when the grid would be invalid", () => {
    const { getByTestId } = render(
      <CirculatePreviewPane
        sourceImageUrl="https://example.test/a.png"
        displayMmW={4}
        displayMmH={4}
        params={defaults}
      />,
    )
    const canvas = getByTestId("circulate-preview-mini") as HTMLCanvasElement
    expect(canvas.getAttribute("width")).toBe("1")
    expect(canvas.getAttribute("height")).toBe("1")
  })

  it("zoom controls update the displayed zoom label", async () => {
    const { getByTestId, getByLabelText, queryByTestId } = render(
      <CirculatePreviewPane
        sourceImageUrl="https://example.test/a.png"
        displayMmW={100}
        displayMmH={75}
        params={defaults}
      />,
    )
    await waitFor(() => {
      expect(queryByTestId("circulate-preview-zoom-controls")).not.toBeNull()
    })
    const label = () => getByTestId("circulate-preview-zoom-label").textContent
    expect(label()).toBe("100%")
    await act(async () => {
      fireEvent.click(getByLabelText("Zoom in"))
    })
    expect(label()).toBe("150%")
    await act(async () => {
      fireEvent.click(getByLabelText("Fit"))
    })
    expect(label()).toBe("100%")
  })
})
