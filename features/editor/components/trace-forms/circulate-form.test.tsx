/**
 * @vitest-environment jsdom
 *
 * Component test for CirculateForm. Asserts the three segments render their
 * fields (Circle / Spacing / Colors), the inner-ellipse fields + hue shift
 * are disabled until the inner checkbox is on, and the grid-validity line
 * flips between the cut-border info and the error message.
 */
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { circulateSchema, type CirculateParams } from "@/lib/editor/trace/circulate"
import { resolveCirculateGrid } from "@/lib/editor/trace/circulate-grid-math"
import { CirculateForm } from "./circulate-form"

const defaults = circulateSchema.parse({}) as CirculateParams

describe("CirculateForm", () => {
  afterEach(() => cleanup())

  it("renders all segment fields by their input ids", () => {
    const grid = resolveCirculateGrid(100, 75, defaults)
    const { container } = render(
      <CirculateForm params={defaults} onParamsChange={() => {}} disabled={false} grid={grid} />,
    )
    for (const id of [
      "outer_width_mm",
      "outer_height_mm",
      "inner_enabled",
      "inner_width_mm",
      "inner_height_mm",
      "contour_width_mm",
      "spacing_left_mm",
      "spacing_right_mm",
      "spacing_top_mm",
      "spacing_bottom_mm",
      "color_mode",
      "color_space",
      "inner_filter",
    ]) {
      expect(container.querySelector(`#${id}`), `#${id}`).not.toBeNull()
    }
  })

  it("disables the inner ellipse fields + inner colour filter while the inner checkbox is off", () => {
    const grid = resolveCirculateGrid(100, 75, defaults)
    const { container } = render(
      <CirculateForm params={defaults} onParamsChange={() => {}} disabled={false} grid={grid} />,
    )
    expect((container.querySelector("#inner_width_mm") as HTMLInputElement).disabled).toBe(true)
    expect((container.querySelector("#inner_height_mm") as HTMLInputElement).disabled).toBe(true)
    // inner_filter is a select → its trigger is a <button disabled>.
    expect((container.querySelector("#inner_filter") as HTMLButtonElement).disabled).toBe(true)
  })

  it("enables the inner ellipse fields once the inner checkbox is on", () => {
    const grid = resolveCirculateGrid(100, 75, defaults)
    const { container } = render(
      <CirculateForm
        params={{ ...defaults, inner_enabled: true }}
        onParamsChange={() => {}}
        disabled={false}
        grid={grid}
      />,
    )
    expect((container.querySelector("#inner_width_mm") as HTMLInputElement).disabled).toBe(false)
    expect((container.querySelector("#inner_filter") as HTMLButtonElement).disabled).toBe(false)
  })

  it("shows the Schnitt-Rand info when the grid is valid", () => {
    const grid = resolveCirculateGrid(100, 75, defaults)
    const { getByText } = render(
      <CirculateForm params={defaults} onParamsChange={() => {}} disabled={false} grid={grid} />,
    )
    expect(getByText(/Schnitt-Rand/)).toBeTruthy()
  })

  it("shows the error message when the grid is invalid", () => {
    // 4mm image with a 6mm pitch → 0 cells.
    const grid = resolveCirculateGrid(4, 4, defaults)
    const { getByText } = render(
      <CirculateForm params={defaults} onParamsChange={() => {}} disabled={false} grid={grid} />,
    )
    expect(getByText(/Zell-Raster zu groß/)).toBeTruthy()
  })
})
