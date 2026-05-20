/**
 * @vitest-environment jsdom
 *
 * Component test for PixelateForm. Asserts the three FormFields are
 * present and the Schnitt-Rand display flips between valid (border
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

  it("renders all three FormFields by their input ids", () => {
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
    expect(container.querySelector("#num_colors")).not.toBeNull()
  })

  it("shows the Schnitt-Rand info when the grid is valid", () => {
    const grid = resolvePixelateGrid(100, 75, defaults)
    const { getByText } = render(
      <PixelateForm
        params={defaults}
        onParamsChange={() => {}}
        disabled={false}
        grid={grid}
      />,
    )
    expect(getByText(/Schnitt-Rand/)).toBeTruthy()
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
    expect(getByText(/Superpixel zu groß/)).toBeTruthy()
  })
})
