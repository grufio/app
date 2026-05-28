/**
 * @vitest-environment jsdom
 *
 * Component test for PixelateForm. Asserts the FormFields are present
 * (two supercell numeric inputs + the Colors segment's mode/space
 * selects) and the cut-margin display flips between valid (border
 * info) and invalid (error message) based on the passed-in grid.
 */
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { pixelateSchema, type PixelateParams } from "@/lib/editor/trace/pixelate"
import { resolvePixelateGrid } from "@/lib/editor/trace/pixelate-grid-math"
import { PixelateForm } from "./pixelate-form"

const defaults = pixelateSchema.parse({}) as PixelateParams

describe("PixelateForm", () => {
  afterEach(() => cleanup())

  it("renders the supercell inputs + the Colors segment selects by their ids", () => {
    const grid = resolvePixelateGrid(100, 75, defaults)
    const { container } = render(
      <PixelateForm
        params={defaults}
        onParamsChange={() => {}}
        disabled={false}
        grid={grid}
      />,
    )
    expect(container.querySelector("#supercell_width_mm")).not.toBeNull()
    expect(container.querySelector("#supercell_height_mm")).not.toBeNull()
    expect(container.querySelector("#color_mode")).not.toBeNull()
    expect(container.querySelector("#color_space")).not.toBeNull()
    // num_colors is gone — colour comes from the palette map.
    expect(container.querySelector("#num_colors")).toBeNull()
  })

  it("shows the cut-margin info when the grid is valid", () => {
    const grid = resolvePixelateGrid(100, 75, defaults)
    const { getByText } = render(
      <PixelateForm
        params={defaults}
        onParamsChange={() => {}}
        disabled={false}
        grid={grid}
      />,
    )
    expect(getByText(/Cut margin/)).toBeTruthy()
  })

  it("shows the error message when the grid is invalid", () => {
    // 4 mm image with 5 mm supercell → cellsX=0, invalid.
    const grid = resolvePixelateGrid(4, 4, { supercell_width_mm: 5, supercell_height_mm: 5 })
    const { getByText } = render(
      <PixelateForm
        params={defaults}
        onParamsChange={() => {}}
        disabled={false}
        grid={grid}
      />,
    )
    expect(getByText(/Superpixel too large/)).toBeTruthy()
  })
})
