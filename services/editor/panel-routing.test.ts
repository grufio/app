import { describe, expect, it } from "vitest"

import { mapSelectedNavIdToRightPanelSection } from "./panel-routing"
import { resolveRightSectionFromNavKind } from "./section-registry"

describe("panel-routing", () => {
  it("routes artboard selection to artboard panel", () => {
    expect(mapSelectedNavIdToRightPanelSection("app")).toBe("artboard")
  })

  it("routes image and imagesFolder selections to image panel", () => {
    expect(mapSelectedNavIdToRightPanelSection("app/api")).toBe("image")
    expect(mapSelectedNavIdToRightPanelSection("app/api/img-1")).toBe("image")
  })

  it("routes grid selection to grid panel", () => {
    expect(mapSelectedNavIdToRightPanelSection("app/api/grid")).toBe("grid")
  })

  it("covers every nav kind via registry", () => {
    expect(resolveRightSectionFromNavKind("artboard")).toBe("artboard")
    expect(resolveRightSectionFromNavKind("imagesFolder")).toBe("image")
    expect(resolveRightSectionFromNavKind("image")).toBe("image")
    expect(resolveRightSectionFromNavKind("grid")).toBe("grid")
  })
})
