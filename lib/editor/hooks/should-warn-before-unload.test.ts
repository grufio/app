import { describe, expect, it } from "vitest"

import { shouldWarnBeforeUnload } from "./should-warn-before-unload"

const allFalse = {
  mutationInFlight: false,
  filterDialogConfiguring: false,
  traceDialogConfiguring: false,
}

describe("shouldWarnBeforeUnload", () => {
  it("returns false when nothing is in flight or configured", () => {
    expect(shouldWarnBeforeUnload(allFalse)).toBe(false)
  })

  it("warns when a mutation is in flight", () => {
    expect(
      shouldWarnBeforeUnload({ ...allFalse, mutationInFlight: true }),
    ).toBe(true)
  })

  it("warns when the filter dialog is being configured", () => {
    expect(
      shouldWarnBeforeUnload({ ...allFalse, filterDialogConfiguring: true }),
    ).toBe(true)
  })

  it("warns when the trace dialog is being configured", () => {
    expect(
      shouldWarnBeforeUnload({ ...allFalse, traceDialogConfiguring: true }),
    ).toBe(true)
  })

  it("warns when multiple signals are active", () => {
    expect(
      shouldWarnBeforeUnload({
        mutationInFlight: true,
        filterDialogConfiguring: true,
        traceDialogConfiguring: true,
      }),
    ).toBe(true)
  })
})
