/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest"

import { useTracePalette } from "@/lib/editor/trace/use-trace-palette"

import { PaletteColorGrid } from "./palette-color-grid"

vi.mock("@/lib/editor/trace/use-trace-palette", () => ({ useTracePalette: vi.fn() }))

const chip = (notation: string, rgb: readonly [number, number, number], name: string | null) => ({
  oklab: { L: 0, a: 0, b: 0 },
  rgb,
  notation,
  color_name: name,
})

const PALETTE = [
  chip("5R 4/14", [255, 0, 0], "Red"),
  chip("5Y 8/12", [255, 255, 0], "Yellow"),
  chip("5B 5/10", [0, 0, 255], "Blue"),
]

describe("PaletteColorGrid", () => {
  beforeEach(() => {
    ;(useTracePalette as unknown as Mock).mockReturnValue(PALETTE)
  })
  afterEach(() => cleanup())

  it("prompts to run a trace when there is none", () => {
    const { getByText } = render(<PaletteColorGrid paletteIndicesUsed={[0]} traceMode={null} hasTrace={false} />)
    expect(getByText("Run a trace to see its colors.")).toBeTruthy()
  })

  it("prompts to re-run for a legacy trace (null indices)", () => {
    const { getByText } = render(<PaletteColorGrid paletteIndicesUsed={null} traceMode="color" hasTrace />)
    expect(getByText("Re-run this trace to capture its referenced colors.")).toBeTruthy()
  })

  it("shows an empty message when the trace references no colors", () => {
    const { getByText } = render(<PaletteColorGrid paletteIndicesUsed={[]} traceMode="color" hasTrace />)
    expect(getByText("This trace doesn't reference any palette colors.")).toBeTruthy()
  })

  it("shows a loading message while the palette is fetching", () => {
    ;(useTracePalette as unknown as Mock).mockReturnValue(null)
    const { getByText } = render(<PaletteColorGrid paletteIndicesUsed={[0]} traceMode="color" hasTrace />)
    expect(getByText("Loading palette…")).toBeTruthy()
  })

  it("shows a message when the used indices are out of the active palette", () => {
    const { getByText } = render(<PaletteColorGrid paletteIndicesUsed={[99]} traceMode="color" hasTrace />)
    expect(getByText("This trace's referenced colors are not in the active palette.")).toBeTruthy()
  })

  it("renders one tile per valid used index, positionally joined", () => {
    const { getByText, queryByText } = render(
      <PaletteColorGrid paletteIndicesUsed={[0, 2]} traceMode="color" hasTrace />,
    )
    // Chips at palette[0] (Red) and palette[2] (Blue); index 1 (Yellow) is not used.
    expect(getByText("5R 4/14")).toBeTruthy()
    expect(getByText("5B 5/10")).toBeTruthy()
    expect(queryByText("5Y 8/12")).toBeNull()
    // Legend numbers are the 1-based display position (1, 2), not the index.
    expect(getByText("1")).toBeTruthy()
    expect(getByText("2")).toBeTruthy()
  })
})
