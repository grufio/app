import { describe, expect, it } from "vitest"

import { shouldRenderMasterImageUpload } from "./master-image-upload"

describe("master-image-upload", () => {
  it("hides while checking for existing image", () => {
    expect(shouldRenderMasterImageUpload({ status: "checking", variant: "panel" })).toBe(false)
    expect(shouldRenderMasterImageUpload({ status: "checking", variant: "toolbar" })).toBe(false)
  })

  it("hides panel variant when image already exists", () => {
    expect(shouldRenderMasterImageUpload({ status: "hide", variant: "panel" })).toBe(false)
  })

  it("shows toolbar variant even when image already exists", () => {
    expect(shouldRenderMasterImageUpload({ status: "hide", variant: "toolbar" })).toBe(true)
  })
})
