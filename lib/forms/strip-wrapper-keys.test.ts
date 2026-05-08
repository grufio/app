import { describe, expect, it } from "vitest"

import { stripWrapperKeys } from "./strip-wrapper-keys"

describe("stripWrapperKeys", () => {
  it("returns undefined when inputProps is undefined", () => {
    expect(stripWrapperKeys(undefined)).toBeUndefined()
  })

  it("strips onFocus, onBlur, and onKeyDown", () => {
    const onFocus = () => {}
    const onBlur = () => {}
    const onKeyDown = () => {}
    const out = stripWrapperKeys({ onFocus, onBlur, onKeyDown, "aria-label": "n" })
    expect(out).toEqual({ "aria-label": "n" })
  })

  it("preserves arbitrary attributes that are not lifecycle handlers", () => {
    const out = stripWrapperKeys({
      placeholder: "type something",
      autoComplete: "off",
    })
    expect(out).toEqual({
      placeholder: "type something",
      autoComplete: "off",
    })
  })

  it("returns an empty object when only stripped keys were present", () => {
    const out = stripWrapperKeys({ onFocus: () => {}, onBlur: () => {}, onKeyDown: () => {} })
    expect(out).toEqual({})
  })
})
