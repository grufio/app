import { describe, expect, it } from "vitest"

import { deriveSectionLocks } from "./section-locks"

describe("deriveSectionLocks", () => {
  it("only master → nothing locked", () => {
    expect(deriveSectionLocks({ hasFilter: false, hasTrace: false })).toEqual({
      imageLocked: false,
      imageToggleable: false,
      filterLocked: false,
      filterToggleable: false,
    })
  })

  it("master + filter → image locked (toggleable), filter free", () => {
    expect(deriveSectionLocks({ hasFilter: true, hasTrace: false })).toEqual({
      imageLocked: true,
      imageToggleable: true,
      filterLocked: false,
      filterToggleable: false,
    })
  })

  it("master + filter + trace → both locked, both toggleable", () => {
    expect(deriveSectionLocks({ hasFilter: true, hasTrace: true })).toEqual({
      imageLocked: true,
      imageToggleable: true,
      filterLocked: true,
      filterToggleable: true,
    })
  })

  it("master + trace (no filter) → both locked, filter NOT toggleable", () => {
    expect(deriveSectionLocks({ hasFilter: false, hasTrace: true })).toEqual({
      imageLocked: true,
      imageToggleable: true,
      filterLocked: true,
      filterToggleable: false,
    })
  })
})
