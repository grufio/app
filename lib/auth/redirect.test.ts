/**
 * Unit tests for auth redirect safety helpers.
 */
import { describe, expect, it } from "vitest"

import { isAllowedAppPath, safeAppRedirectUrl } from "./redirect"

describe("auth redirect helpers", () => {
  it("allows dashboard and projects paths", () => {
    expect(isAllowedAppPath("/dashboard")).toBe(true)
    expect(isAllowedAppPath("/dashboard/x")).toBe(true)
    expect(isAllowedAppPath("/projects")).toBe(true)
    expect(isAllowedAppPath("/projects/123")).toBe(true)
    expect(isAllowedAppPath("/login")).toBe(false)
    expect(isAllowedAppPath("https://evil.com")).toBe(false)
  })

  it("falls back to /dashboard for unsafe targets", () => {
    expect(safeAppRedirectUrl({ origin: "https://example.com", pathname: "https://evil.com" })).toBe(
      "https://example.com/dashboard"
    )
    expect(safeAppRedirectUrl({ origin: "https://example.com", pathname: "//evil.com" })).toBe(
      "https://example.com/dashboard"
    )
    expect(safeAppRedirectUrl({ origin: "https://example.com", pathname: "/login" })).toBe(
      "https://example.com/dashboard"
    )
  })
})

