import { describe, expect, it } from "vitest"

import {
  numericInputClassWhenUnit,
  numericUnitAddonClass,
} from "./numeric-variant-classes"

describe("numericInputClassWhenUnit", () => {
  it("returns the !pr-2 override when a unit is present", () => {
    expect(numericInputClassWhenUnit("mm")).toBe("!pr-2")
  })

  it("returns null when no unit (default input padding wins)", () => {
    expect(numericInputClassWhenUnit(undefined)).toBeNull()
    expect(numericInputClassWhenUnit("")).toBeNull()
  })
})

describe("numericUnitAddonClass", () => {
  it("zeroes the addon's left padding so the gap is fully governed by the input's pr-2", () => {
    // Both halves of the contract must travel together; if either side
    // changes shape the visual gap drifts.
    expect(numericUnitAddonClass).toMatch(/!pl-0/)
    expect(numericUnitAddonClass).toMatch(/pointer-events-none/)
  })
})
