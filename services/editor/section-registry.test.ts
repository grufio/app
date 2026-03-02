import { describe, expect, it } from "vitest"

import { resolveRightSectionFromNavKind, SECTION_REGISTRY } from "./section-registry"

describe("section-registry", () => {
  it("maps every nav kind to exactly one right section", () => {
    expect(resolveRightSectionFromNavKind("artboard")).toBe("artboard")
    expect(resolveRightSectionFromNavKind("imagesFolder")).toBe("image")
    expect(resolveRightSectionFromNavKind("image")).toBe("image")
    expect(resolveRightSectionFromNavKind("grid")).toBe("grid")
  })

  it("keeps registry keys aligned with nav kinds", () => {
    expect(Object.keys(SECTION_REGISTRY).sort()).toEqual(["artboard", "grid", "image", "imagesFolder"])
  })
})
