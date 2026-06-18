import { describe, expect, it } from "vitest"

import { deriveSectionLocks } from "./section-locks"

describe("deriveSectionLocks", () => {
  it("only master → nothing locked", () => {
    expect(deriveSectionLocks({ hasFilter: false, hasTrace: false })).toEqual({
      imageLocked: false,
      filterLocked: false,
    })
  })

  it("master + filter → image locked, filter free", () => {
    expect(deriveSectionLocks({ hasFilter: true, hasTrace: false })).toEqual({
      imageLocked: true,
      filterLocked: false,
    })
  })

  it("master + filter + trace → both locked", () => {
    expect(deriveSectionLocks({ hasFilter: true, hasTrace: true })).toEqual({
      imageLocked: true,
      filterLocked: true,
    })
  })

  it("master + trace (no filter) → both locked", () => {
    expect(deriveSectionLocks({ hasFilter: false, hasTrace: true })).toEqual({
      imageLocked: true,
      filterLocked: true,
    })
  })
})
