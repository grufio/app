/**
 * @vitest-environment jsdom
 *
 * Component test for LineArtPreviewPane.
 *
 * jsdom can't render canvas content, so we only assert the React/JSX
 * wiring: the canvas bitmap is sized to the downscaled buffer (set by
 * the stubbed pipeline) and zoom controls update on click.
 */
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/editor/trace/lineart-preview", () => ({
  // Stubs return a synthetic downscaled buffer + a single-cluster
  // quantisation so the pane has something to render `width`/`height`
  // attributes off; the canvas paint is a no-op in jsdom.
  loadAndDownscale: () => ({ width: 64, height: 48, rgba: new Uint8ClampedArray(64 * 48 * 4) }),
  gaussianBlur: (img: unknown) => img,
  kMeansOklab: () => ({ centroids: [[0.5, 0, 0]], assignments: new Uint16Array(64 * 48) }),
  snapCentroidsToPalette: () => [{ r: 128, g: 128, b: 128 }],
  paintQuantizedToCanvas: () => {
    /* noop in jsdom */
  },
}))

vi.mock("@/lib/editor/trace/use-trace-palette", () => ({
  useTracePalette: () => null,
}))

import { lineartSchema, type LineartParams } from "@/lib/editor/trace/lineart"
import { FakeImage, FakeResizeObserver } from "@/lib/test/jsdom-stubs"

import { LineArtPreviewPane } from "./lineart-preview-pane"

const defaults = lineartSchema.parse({}) as LineartParams

describe("LineArtPreviewPane", () => {
  beforeEach(() => {
    vi.stubGlobal("Image", FakeImage)
    vi.stubGlobal("ResizeObserver", FakeResizeObserver)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("renders the mini canvas at the downscaled buffer resolution", async () => {
    const { getByTestId } = render(
      <LineArtPreviewPane
        sourceImageUrl="https://example.test/a.png"
        displayMmW={100}
        displayMmH={75}
        params={defaults}
      />,
    )

    await waitFor(() => {
      const canvas = getByTestId("lineart-preview-mini") as HTMLCanvasElement
      expect(canvas.getAttribute("width")).toBe("64")
      expect(canvas.getAttribute("height")).toBe("48")
    })
  })

  it("falls back to 1×1 bitmap before the source image loads", () => {
    // Without waiting for the FakeImage onload, the pane should still
    // render its canvas at the placeholder size.
    const { getByTestId } = render(
      <LineArtPreviewPane
        sourceImageUrl=""
        displayMmW={0}
        displayMmH={0}
        params={defaults}
      />,
    )
    const canvas = getByTestId("lineart-preview-mini") as HTMLCanvasElement
    expect(canvas.getAttribute("width")).toBe("1")
    expect(canvas.getAttribute("height")).toBe("1")
  })

  it("zoom controls update the displayed zoom label and step ranges", async () => {
    const { getByTestId, getByLabelText, queryByTestId } = render(
      <LineArtPreviewPane
        sourceImageUrl="https://example.test/a.png"
        displayMmW={100}
        displayMmH={75}
        params={defaults}
      />,
    )

    await waitFor(() => {
      expect(queryByTestId("lineart-preview-zoom-controls")).not.toBeNull()
    })

    const label = () => getByTestId("lineart-preview-zoom-label").textContent

    expect(label()).toBe("100%")
    expect((getByLabelText("Zoom out") as HTMLButtonElement).disabled).toBe(true)

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
