import { describe, expect, it } from "vitest"

import { buildNavId } from "./nav-id"
import { recoverSelectedNavId } from "./selection-recovery"

describe("selection-recovery", () => {
  it("falls back to active master image if selected image becomes stale", () => {
    const out = recoverSelectedNavId({
      selectedNavId: buildNavId({ kind: "image", imageId: "stale" }),
      images: [{ id: "img-1" }, { id: "img-2" }],
      activeMasterImageId: "img-2",
    })
    expect(out).toBe(buildNavId({ kind: "image", imageId: "img-2" }))
  })

  it("falls back to artboard if no active image exists", () => {
    const out = recoverSelectedNavId({
      selectedNavId: buildNavId({ kind: "image", imageId: "stale" }),
      images: [],
      activeMasterImageId: null,
    })
    expect(out).toBe(buildNavId({ kind: "artboard" }))
  })

  it("keeps non-image selections unchanged", () => {
    const out = recoverSelectedNavId({
      selectedNavId: buildNavId({ kind: "artboard" }),
      images: [{ id: "img-1" }],
      activeMasterImageId: "img-1",
    })
    expect(out).toBe(buildNavId({ kind: "artboard" }))
  })
})
