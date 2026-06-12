import { describe, expect, it } from "vitest"

import { sheetRootClass } from "./sheet-shell"

describe("sheetRootClass", () => {
  it("mobile (default) is a fullscreen overlay hidden on md+", () => {
    const cls = sheetRootClass(false)
    expect(cls).toContain("absolute")
    expect(cls).toContain("inset-0")
    expect(cls).toContain("md:hidden")
    // No bounded-card md overrides in the mobile variant.
    expect(cls).not.toContain("md:w-80")
  })

  it("undefined behaves like mobile (fullscreen, md:hidden)", () => {
    expect(sheetRootClass(undefined)).toContain("md:hidden")
  })

  it("desktop variant drops md:hidden and adds the bounded floating card", () => {
    const cls = sheetRootClass(true)
    expect(cls).not.toContain("md:hidden")
    // Bounded card anchored under the top-right bar.
    expect(cls).toContain("md:inset-auto")
    expect(cls).toContain("md:top-16")
    expect(cls).toContain("md:right-3")
    expect(cls).toContain("md:w-80")
    // Still a fullscreen overlay on mobile (base classes retained).
    expect(cls).toContain("inset-0")
  })
})
