import { describe, expect, it } from "vitest"

import { evaluateDeleteTarget } from "./delete-target-policy"

describe("evaluateDeleteTarget", () => {
  it("blocks deleting master target", () => {
    const out = evaluateDeleteTarget({
      targetImageId: "img-1",
      targetKind: "master",
    })
    expect(out).toEqual({ deletable: false, delete_reason: "master_immutable" })
  })

  it("allows deleting working copy target", () => {
    const out = evaluateDeleteTarget({
      targetImageId: "img-2",
      targetKind: "working_copy",
    })
    expect(out).toEqual({ deletable: true, delete_reason: null })
  })

  it("allows deleting filter working copy target", () => {
    const out = evaluateDeleteTarget({
      targetImageId: "img-3",
      targetKind: "filter_working_copy",
    })
    expect(out).toEqual({ deletable: true, delete_reason: null })
  })

  it("returns no_active_image when target is missing", () => {
    const out = evaluateDeleteTarget({
      targetImageId: null,
      targetKind: null,
    })
    expect(out).toEqual({ deletable: false, delete_reason: "no_active_image" })
  })
})

