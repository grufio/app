import { describe, expect, it } from "vitest"

import { buildNavId, parseNavId } from "./nav-id"

describe("nav-id", () => {
  it("builds stable IDs for editor nav nodes", () => {
    expect(buildNavId({ kind: "artboard" })).toBe("app")
    expect(buildNavId({ kind: "imagesFolder" })).toBe("app/api")
    expect(buildNavId({ kind: "image", imageId: "img-1" })).toBe("app/api/img-1")
  })

  it("parses IDs into typed selections", () => {
    expect(parseNavId("app")).toEqual({ kind: "artboard" })
    expect(parseNavId("app/api")).toEqual({ kind: "imagesFolder" })
    expect(parseNavId("app/api/img-1")).toEqual({ kind: "image", imageId: "img-1" })
  })

  it("falls back to artboard for unknown IDs", () => {
    expect(parseNavId("unknown")).toEqual({ kind: "artboard" })
  })
})
