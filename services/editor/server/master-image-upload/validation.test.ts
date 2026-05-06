import { describe, expect, it } from "vitest"

import {
  normalizePositiveInt,
  parseAllowedMimeList,
  parseOptionalPositiveInt,
  resolveImageDpi,
} from "./validation"

describe("parseOptionalPositiveInt", () => {
  it("returns null for unset / non-string / empty / whitespace", () => {
    expect(parseOptionalPositiveInt(undefined)).toBeNull()
    expect(parseOptionalPositiveInt("")).toBeNull()
    expect(parseOptionalPositiveInt("   ")).toBeNull()
  })
  it("returns null for non-finite or non-integer or ≤ 0", () => {
    expect(parseOptionalPositiveInt("NaN")).toBeNull()
    expect(parseOptionalPositiveInt("Infinity")).toBeNull()
    expect(parseOptionalPositiveInt("3.14")).toBeNull()
    expect(parseOptionalPositiveInt("0")).toBeNull()
    expect(parseOptionalPositiveInt("-5")).toBeNull()
  })
  it("returns the parsed integer for valid positive integers", () => {
    expect(parseOptionalPositiveInt("1")).toBe(1)
    expect(parseOptionalPositiveInt("42")).toBe(42)
    expect(parseOptionalPositiveInt("999999")).toBe(999999)
  })
})

describe("parseAllowedMimeList", () => {
  it("returns null for unset / empty / whitespace", () => {
    expect(parseAllowedMimeList(undefined)).toBeNull()
    expect(parseAllowedMimeList("")).toBeNull()
    expect(parseAllowedMimeList("   ")).toBeNull()
    expect(parseAllowedMimeList(",,,")).toBeNull()
  })
  it("returns a Set with trimmed entries", () => {
    const out = parseAllowedMimeList("image/png, image/jpeg ,image/webp")
    expect(out).toBeInstanceOf(Set)
    expect(out?.has("image/png")).toBe(true)
    expect(out?.has("image/jpeg")).toBe(true)
    expect(out?.has("image/webp")).toBe(true)
    expect(out?.size).toBe(3)
  })
  it("drops empty entries", () => {
    const out = parseAllowedMimeList("image/png,,image/jpeg,")
    expect(out?.size).toBe(2)
  })
})

describe("normalizePositiveInt", () => {
  it("truncates and rejects non-positive / non-finite", () => {
    expect(normalizePositiveInt(3.7)).toBe(3)
    expect(normalizePositiveInt(0)).toBeNull()
    expect(normalizePositiveInt(-1)).toBeNull()
    expect(normalizePositiveInt(NaN)).toBeNull()
    expect(normalizePositiveInt(Infinity)).toBeNull()
  })
  it("preserves positive integers", () => {
    expect(normalizePositiveInt(42)).toBe(42)
    expect(normalizePositiveInt(1)).toBe(1)
  })
})

describe("resolveImageDpi", () => {
  it("returns the rounded average when both axes are present", () => {
    expect(resolveImageDpi({ dpiX: 300, dpiY: 300 })).toBe(300)
    expect(resolveImageDpi({ dpiX: 200, dpiY: 300 })).toBe(250)
    expect(resolveImageDpi({ dpiX: 199, dpiY: 200 })).toBe(200) // rounded
  })
  it("falls back to whichever axis is set", () => {
    expect(resolveImageDpi({ dpiX: 150, dpiY: null })).toBe(150)
    expect(resolveImageDpi({ dpiX: null, dpiY: 250 })).toBe(250)
  })
  it("defaults to 72 when both axes are missing", () => {
    expect(resolveImageDpi({ dpiX: null, dpiY: null })).toBe(72)
    expect(resolveImageDpi({ dpiX: 0, dpiY: 0 })).toBe(72)
  })
  it("clamps to a minimum of 1 for tiny positive values", () => {
    // Math.max(1, 0.4) = 1 (only single-axis; both-axes path averages first).
    expect(resolveImageDpi({ dpiX: 0.4, dpiY: null })).toBe(1)
  })
})
