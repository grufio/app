import { describe, expect, it } from "vitest"

import { sheetRootClass } from "./sheet-shell"

describe("sheetRootClass", () => {
  it("is a fullscreen overlay on every viewport (desktop matches mobile)", () => {
    const cls = sheetRootClass()
    expect(cls).toContain("absolute")
    expect(cls).toContain("inset-0")
    // Unified: no mobile-only hiding and no bounded-card desktop overrides.
    expect(cls).not.toContain("md:hidden")
    expect(cls).not.toContain("md:w-80")
    expect(cls).not.toContain("md:inset-auto")
  })
})
