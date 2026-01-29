/**
 * Unit tests for `lib/editor/numeric.ts`.
 *
 * Focus:
 * - Input sanitization and parsing behave predictably for editor fields.
 */
import { describe, expect, it } from "vitest"

import { parseNumericInput, sanitizeNumericInput } from "./numeric"

describe("numeric", () => {
  describe("sanitizeNumericInput", () => {
    it("keeps empty string", () => {
      expect(sanitizeNumericInput("", "decimal")).toBe("")
      expect(sanitizeNumericInput("", "int")).toBe("")
    })

    it("int mode strips non-digits", () => {
      expect(sanitizeNumericInput("a1b2c3", "int")).toBe("123")
      expect(sanitizeNumericInput("12.34", "int")).toBe("1234")
      expect(sanitizeNumericInput("-99", "int")).toBe("99")
    })

    it("decimal mode allows one dot and normalizes comma", () => {
      expect(sanitizeNumericInput("12,34", "decimal")).toBe("12.34")
      expect(sanitizeNumericInput("..1.2.3..", "decimal")).toBe(".123")
      expect(sanitizeNumericInput("1.2.3", "decimal")).toBe("1.23")
    })

    it("decimal mode strips minus and other symbols (by design)", () => {
      expect(sanitizeNumericInput("-1.25", "decimal")).toBe("1.25")
      expect(sanitizeNumericInput("  $1,250.00  ", "decimal")).toBe("1250.00")
      expect(sanitizeNumericInput("  1.250,00  ", "decimal")).toBe("1250.00")
    })
  })

  describe("parseNumericInput", () => {
    it("parses finite numbers", () => {
      expect(parseNumericInput("12")).toBe(12)
      expect(parseNumericInput("12.5")).toBe(12.5)
    })

    it("returns NaN for invalid numbers", () => {
      expect(Number.isNaN(parseNumericInput("abc"))).toBe(true)
      expect(Number.isNaN(parseNumericInput(""))).toBe(false) // Number('') === 0
    })
  })
})

