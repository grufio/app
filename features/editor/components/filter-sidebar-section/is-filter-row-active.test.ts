import { describe, expect, it } from "vitest"

import { isFilterRowActive } from "./is-filter-row-active"

describe("isFilterRowActive", () => {
  it("highlights the row whose id matches the active display target on the Filter tab", () => {
    expect(
      isFilterRowActive({
        canvasMode: "filter",
        activeDisplayFilterId: "f-1",
        isActiveDisplayFilterHidden: false,
        filterId: "f-1",
      }),
    ).toBe(true)
  })

  it("does not highlight other rows even on the Filter tab", () => {
    expect(
      isFilterRowActive({
        canvasMode: "filter",
        activeDisplayFilterId: "f-1",
        isActiveDisplayFilterHidden: false,
        filterId: "f-2",
      }),
    ).toBe(false)
  })

  it("does not highlight any row when the canvas is in image mode", () => {
    expect(
      isFilterRowActive({
        canvasMode: "image",
        activeDisplayFilterId: "f-1",
        isActiveDisplayFilterHidden: false,
        filterId: "f-1",
      }),
    ).toBe(false)
  })

  it("does not highlight when the active display filter is hidden", () => {
    expect(
      isFilterRowActive({
        canvasMode: "filter",
        activeDisplayFilterId: "f-1",
        isActiveDisplayFilterHidden: true,
        filterId: "f-1",
      }),
    ).toBe(false)
  })

  it("returns false when there is no active display filter", () => {
    expect(
      isFilterRowActive({
        canvasMode: "filter",
        activeDisplayFilterId: null,
        isActiveDisplayFilterHidden: false,
        filterId: "f-1",
      }),
    ).toBe(false)
  })
})
