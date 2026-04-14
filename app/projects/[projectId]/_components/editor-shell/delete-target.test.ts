import { describe, expect, it } from "vitest"

import { isStaleSelectionDeleteError, resolveDeleteTargetImageId } from "./delete-target"

describe("delete target resolver", () => {
  it("uses selected image id when it still exists", () => {
    const target = resolveDeleteTargetImageId({
      selectedImageId: "img-2",
      projectImages: [{ id: "img-1" }, { id: "img-2" }],
      activeImageId: "img-1",
    })
    expect(target).toBe("img-2")
  })

  it("falls back to active display target when selected id is stale", () => {
    const target = resolveDeleteTargetImageId({
      selectedImageId: "img-stale",
      projectImages: [{ id: "img-1" }, { id: "img-2" }],
      activeImageId: "img-2",
    })
    expect(target).toBe("img-2")
  })

  it("returns null when no valid delete target exists", () => {
    const target = resolveDeleteTargetImageId({
      selectedImageId: "img-stale",
      projectImages: [{ id: "img-1" }],
      activeImageId: null,
    })
    expect(target).toBeNull()
  })
})

describe("stale selection error detector", () => {
  it("detects stale selection stage in API error message", () => {
    expect(isStaleSelectionDeleteError("Failed to delete image (HTTP 409, stage=stale_selection): stale")).toBe(true)
  })

  it("ignores non-stale API error messages", () => {
    expect(isStaleSelectionDeleteError("Failed to delete image (HTTP 409, stage=no_active_image): missing")).toBe(false)
  })
})
