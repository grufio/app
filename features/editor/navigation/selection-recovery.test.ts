import { describe, expect, it } from "vitest"

import { buildNavId } from "./nav-id"
import { recoverSelectedNavId } from "./selection-recovery"

describe("selection-recovery", () => {
  it("falls back to the current master image if the selected image is stale", () => {
    const out = recoverSelectedNavId({
      selectedNavId: buildNavId({ kind: "image", imageId: "stale" }),
      masterImageId: "master-1",
    })
    expect(out).toBe(buildNavId({ kind: "image", imageId: "master-1" }))
  })

  it("keeps the selection when it already points at the master", () => {
    const out = recoverSelectedNavId({
      selectedNavId: buildNavId({ kind: "image", imageId: "master-1" }),
      masterImageId: "master-1",
    })
    expect(out).toBe(buildNavId({ kind: "image", imageId: "master-1" }))
  })

  it("falls back to artboard when no master image exists", () => {
    const out = recoverSelectedNavId({
      selectedNavId: buildNavId({ kind: "image", imageId: "stale" }),
      masterImageId: null,
    })
    expect(out).toBe(buildNavId({ kind: "artboard" }))
  })

  it("keeps non-image selections unchanged", () => {
    const out = recoverSelectedNavId({
      selectedNavId: buildNavId({ kind: "artboard" }),
      masterImageId: "master-1",
    })
    expect(out).toBe(buildNavId({ kind: "artboard" }))
  })
})
