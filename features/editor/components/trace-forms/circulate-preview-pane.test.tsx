/**
 * @vitest-environment jsdom
 *
 * Component test for CirculatePreviewPane. jsdom can't render canvas content and
 * its ResizeObserver is a no-op, so the pane is never measured → `display` is null
 * → the canvas backing falls back to 1×1. In the browser the backing is
 * display × devicePixelRatio (device resolution, verified visually). Here we assert
 * the React/JSX wiring: the canvas mounts and the zoom controls drive the label.
 * The renderer + palette hook are stubbed (no canvas, no network in jsdom).
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

  it("renders the mini canvas with a device-resolution backing (not cellsX × cellsY)", async () => {
    const { getByTestId } = render(
      <CirculatePreviewPane
        sourceImageUrl="https://example.test/a.png"
        displayMmW={100}
        displayMmH={75}
        params={defaults}
      />,
    )
    // Browser: backing = display × devicePixelRatio. jsdom's no-op ResizeObserver
    // leaves the pane unmeasured → a 1×1 fallback. Either way the backing is NOT the
    // tiny cellsX×cellsY (16×12) — the past bug this guards against.
    await waitFor(() => {
      const canvas = getByTestId("circulate-preview-mini") as HTMLCanvasElement
      const w = Number(canvas.getAttribute("width"))
      expect(w).toBeGreaterThanOrEqual(1)
      expect(w).not.toBe(16)
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
