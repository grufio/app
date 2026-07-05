/**
 * @vitest-environment jsdom
 *
 * Component test for CirculatePreviewPane. jsdom can't render canvas content and
 * its ResizeObserver is a no-op, so the pane is never measured → `display` is null
 * → the draw effect skips (the canvas keeps its default backing). In the browser the
 * backing is set in the effect to display × devicePixelRatio (verified visually).
 * Here we assert the React/JSX wiring: the canvas mounts and the zoom controls drive
 * the label. The renderer + palette hook are stubbed (no canvas, no network in jsdom).
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

  it("renders the mini canvas (device-resolution backing set in the draw effect)", async () => {
    const { getByTestId } = render(
      <CirculatePreviewPane
        sourceImageUrl="https://example.test/a.png"
        displayMmW={100}
        displayMmH={75}
        params={defaults}
      />,
    )
    // The canvas backing (width/height) is set INSIDE the draw effect to
    // display × devicePixelRatio (like the pixelate preview). jsdom's no-op
    // ResizeObserver leaves the pane unmeasured (display null → the effect skips),
    // so we only assert the canvas mounts; the device sizing is browser-runtime.
    await waitFor(() => {
      expect(getByTestId("circulate-preview-mini")).not.toBeNull()
    })
  })

  it("still mounts the canvas when the grid would be invalid (no crash)", () => {
    const { getByTestId } = render(
      <CirculatePreviewPane
        sourceImageUrl="https://example.test/a.png"
        displayMmW={4}
        displayMmH={4}
        params={defaults}
      />,
    )
    expect(getByTestId("circulate-preview-mini")).not.toBeNull()
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
