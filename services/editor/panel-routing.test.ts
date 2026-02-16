import { describe, expect, it } from "vitest"

import { mapSelectedNavIdToRightPanelSection } from "./panel-routing"

describe("panel-routing", () => {
  it("routes artboard selection to artboard panel", () => {
    expect(mapSelectedNavIdToRightPanelSection("app")).toBe("artboard")
  })

  it("routes image and imagesFolder selections to image panel", () => {
    expect(mapSelectedNavIdToRightPanelSection("app/api")).toBe("image")
    expect(mapSelectedNavIdToRightPanelSection("app/api/img-1")).toBe("image")
  })
})
