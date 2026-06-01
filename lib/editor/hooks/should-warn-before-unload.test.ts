import { describe, expect, it } from "vitest"

import { shouldWarnBeforeUnload } from "./should-warn-before-unload"

describe("shouldWarnBeforeUnload", () => {
  it("returns false when no mutation is in flight", () => {
    expect(shouldWarnBeforeUnload({ mutationInFlight: false })).toBe(false)
  })

  it("warns when a mutation is in flight", () => {
    expect(shouldWarnBeforeUnload({ mutationInFlight: true })).toBe(true)
  })
})
