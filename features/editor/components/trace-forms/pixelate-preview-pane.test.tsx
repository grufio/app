/**
 * @vitest-environment jsdom
 *
 * Component test for PixelatePreviewPane.
 *
 * The preview is one inline SVG (cells + grid). jsdom can't run the
 * canvas pixel-read pipeline, so we only assert the React/JSX wiring:
 * the SVG container renders (no canvas) and the spinner/zoom controls
 * behave. The SVG markup itself is covered by the pure
 * `buildPixelateCellsSvg` unit test.
 */
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/editor/trace/pixelate-preview", () => ({
  // Pane now consumes the decomposed pipeline; all stages no-op in jsdom.
  readSourceCells: () => null,
  restrictPaletteForCells: (args: { palette: unknown }) => args.palette,
  snapAndDitherCells: () => null,
  applyTextureStep: () => null,
  applyTopNReduction: () => null,
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

  it("renders the SVG preview container, not a canvas", async () => {
    const { getByTestId, queryByTestId } = render(
      <PixelatePreviewPane
        sourceImageUrl="https://example.test/a.png"
        displayMmW={100}
        displayMmH={75}
        params={defaults}
      />,
    )

    // The preview is now one inline SVG (via dangerouslySetInnerHTML); the
    // old `<canvas>` is gone. The container mounts once the source loads.
    await waitFor(() => {
      expect(getByTestId("pixelate-preview-svg")).not.toBeNull()
    })
    expect(queryByTestId("pixelate-preview-mini")).toBeNull()
  })

  it("keeps the loading spinner until the palette resolves, even after the source loads", async () => {
    const { getByText, queryByTestId } = render(
      <PixelatePreviewPane
        sourceImageUrl="https://example.test/a.png"
        displayMmW={100}
        displayMmH={75}
        params={defaults}
      />,
    )

    // The zoom controls render on `source && valid`, so their presence
    // proves the source image has loaded.
    await waitFor(() => {
      expect(queryByTestId("pixelate-preview-zoom-controls")).not.toBeNull()
    })

    // …yet the palette mock is still null (loading), so the pane must keep
    // the spinner instead of painting the raw-means fallback — the vivid
    // preview that used to flash before the palette-snapped one.
    expect(getByText(/Loading preview/)).not.toBeNull()
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
