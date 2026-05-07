/**
 * Phase 0: tests defining the contract for the hex normalizer that
 * powers the <FormField variant="color"> input. Logic extracted from
 * IconColorField, which used to inline it.
 */
import { describe, expect, it } from "vitest"

import { normalizeHex } from "./normalize-hex"

describe("normalizeHex", () => {
  it("expands 3-digit to 6-digit and adds the #", () => {
    expect(normalizeHex("fff")).toBe("#FFFFFF")
    expect(normalizeHex("abc")).toBe("#AABBCC")
  })

  it("preserves already-valid 6-digit hex (with or without #) and uppercases", () => {
    expect(normalizeHex("123456")).toBe("#123456")
    expect(normalizeHex("#abcdef")).toBe("#ABCDEF")
    expect(normalizeHex("#AaBbCc")).toBe("#AABBCC")
  })

  it("trims whitespace before parsing", () => {
    expect(normalizeHex("  #fff  ")).toBe("#FFFFFF")
    expect(normalizeHex("\t123ABC\n")).toBe("#123ABC")
  })

  it("returns null for empty / whitespace-only", () => {
    expect(normalizeHex("")).toBe(null)
    expect(normalizeHex("   ")).toBe(null)
  })

  it("returns null for non-hex characters", () => {
    expect(normalizeHex("xyz")).toBe(null)
    expect(normalizeHex("12345g")).toBe(null)
    expect(normalizeHex("#xyz")).toBe(null)
  })

  it("returns null for incorrect length (not 3 or 6 hex digits)", () => {
    expect(normalizeHex("12")).toBe(null)
    expect(normalizeHex("1234")).toBe(null)
    expect(normalizeHex("12345")).toBe(null)
    expect(normalizeHex("1234567")).toBe(null)
  })

  it("rejects inputs with mid-string #", () => {
    expect(normalizeHex("12#345")).toBe(null)
  })
})
