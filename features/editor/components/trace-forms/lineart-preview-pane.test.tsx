/**
 * @vitest-environment jsdom
 *
 * Component test for LineArtPreviewPane.
 *
 * The pane now renders an inline DOM SVG (from the WASM vtracer pipeline)
 * instead of a canvas. jsdom can't run the wasm, so the pipeline's heavy
 * stages + the async trace are stubbed; we assert the React wiring: the traced
 * SVG is injected once ready, the loading spinner shows before the source
 * loads, and the zoom controls update on click.
 */
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/editor/trace/lineart-preview", () => ({
  // Lightweight stand-ins for the canvas/selection stages (no DOM/wasm in jsdom).
  loadAndDownscale: () => ({ width: 64, height: 48, rgba: new Uint8ClampedArray(64 * 48 * 4) }),
  gaussianBlur: (img: unknown) => img,
  rgbaFromPaintMap: () => new Uint8ClampedArray(64 * 48 * 4),
  buildLineartPreviewSvg: () => ({ svg: '<svg id="mock-preview"></svg>', indicesUsed: [] }),
}))

vi.mock("@/lib/editor/trace/coverage-select", () => ({
  coverageSelectPaintMap: () => new Int32Array(64 * 48),
}))

vi.mock("@/lib/editor/trace/lineart-vtracer-wasm", () => ({
  // Resolve immediately with a raw vtracer envelope; buildLineartPreviewSvg
  // (mocked above) turns it into the final markup.
  traceRgbaToSvg: () => Promise.resolve('<svg><path d="M0 0" fill="#123456"/></svg>'),
}))

vi.mock("@/lib/editor/trace/use-trace-palette", () => ({
  useTracePalette: () => [
    { oklab: [0.5, 0, 0], rgb: [128, 128, 128], notation: "grey", color_name: "Grey" },
  ],
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

  it("injects the traced SVG once the pipeline resolves", async () => {
    const { getByTestId } = render(
      <LineArtPreviewPane
        sourceImageUrl="https://example.test/a.png"
        displayMmW={100}
        displayMmH={75}
        params={defaults}
      />,
    )

    await waitFor(
      () => {
        const holder = getByTestId("lineart-preview-svg")
        expect(holder.querySelector("#mock-preview")).not.toBeNull()
      },
      { timeout: 2000 },
    )
  })

  it("shows the loading spinner before the source image loads", () => {
    // Empty URL → the source never loads → no preview SVG, spinner visible.
    const { queryByTestId, getByText } = render(
      <LineArtPreviewPane
        sourceImageUrl=""
        displayMmW={100}
        displayMmH={75}
        params={defaults}
      />,
    )
    expect(queryByTestId("lineart-preview-svg")).toBeNull()
    expect(getByText("Loading preview…")).not.toBeNull()
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
