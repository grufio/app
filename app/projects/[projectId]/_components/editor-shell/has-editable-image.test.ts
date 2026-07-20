import { describe, expect, it } from "vitest"

import { deriveHasEditableImage } from "./has-editable-image"

describe("deriveHasEditableImage", () => {
  it("is true when the canvas source is ready (photo present), even without a master", () => {
    expect(deriveHasEditableImage({ sourceStatus: "ready", hasMaster: false })).toBe(true)
  })

  it("is true when a master is present, even while the source is still loading", () => {
    expect(deriveHasEditableImage({ sourceStatus: "loading", hasMaster: true })).toBe(true)
  })

  it("is false only when there is neither a ready source nor a master", () => {
    expect(deriveHasEditableImage({ sourceStatus: "empty", hasMaster: false })).toBe(false)
    expect(deriveHasEditableImage({ sourceStatus: "loading", hasMaster: false })).toBe(false)
    expect(deriveHasEditableImage({ sourceStatus: "error", hasMaster: false })).toBe(false)
  })
})
