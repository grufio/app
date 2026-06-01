import { describe, expect, it } from "vitest"

import {
  filterDialogReducer,
  initialFilterDialogState,
  toFilterDialogSession,
  type FilterDialogSession,
} from "./filter-dialog-state"

const session: FilterDialogSession = {
  sourceImageId: "img-1",
  sourceImageWidth: 320,
  sourceImageHeight: 240,
  sourceImageUrl: "https://example.test/img.png",
}

describe("toFilterDialogSession", () => {
  it("maps source-image shape to dialog-session shape", () => {
    expect(
      toFilterDialogSession({
        id: "img-1",
        width_px: 320,
        height_px: 240,
        signedUrl: "https://example.test/img.png",
      }),
    ).toEqual(session)
  })
})

describe("filterDialogReducer", () => {
  it("starts in idle", () => {
    expect(initialFilterDialogState).toEqual({ phase: "idle" })
  })

  it("beginSelection transitions idle -> selecting with session", () => {
    expect(
      filterDialogReducer(initialFilterDialogState, { type: "beginSelection", session }),
    ).toEqual({ phase: "selecting", session })
  })

  it("closeSelection from selecting returns to idle", () => {
    expect(
      filterDialogReducer({ phase: "selecting", session }, { type: "closeSelection" }),
    ).toEqual({ phase: "idle" })
  })

  it("selectFilterType in selecting advances to configuring", () => {
    expect(
      filterDialogReducer(
        { phase: "selecting", session },
        { type: "selectFilterType", filterType: "bw_hard" },
      ),
    ).toEqual({ phase: "configuring", session, filterType: "bw_hard" })
  })

  it("selectFilterType is a no-op outside the selecting phase", () => {
    expect(
      filterDialogReducer(initialFilterDialogState, {
        type: "selectFilterType",
        filterType: "bw_hard",
      }),
    ).toEqual({ phase: "idle" })
  })

  it("closeConfigure returns to idle", () => {
    expect(
      filterDialogReducer(
        { phase: "configuring", session, filterType: "bw_hard" },
        { type: "closeConfigure" },
      ),
    ).toEqual({ phase: "idle" })
  })

  it("reset returns to idle from any phase", () => {
    expect(filterDialogReducer({ phase: "selecting", session }, { type: "reset" })).toEqual({
      phase: "idle",
    })
    expect(
      filterDialogReducer(
        { phase: "configuring", session, filterType: "bw_hard" },
        { type: "reset" },
      ),
    ).toEqual({ phase: "idle" })
  })

  it("reset / closeSelection / closeConfigure are idempotent on idle", () => {
    // Matches the trace reducer's contract — the surfaceActive
    // effect in `useFilterDialogSession` dispatches reset whenever
    // the surface goes inactive, including when the dialog is
    // already idle. Same reference back so React skips the render.
    const idle = initialFilterDialogState
    expect(filterDialogReducer(idle, { type: "reset" })).toBe(idle)
    expect(filterDialogReducer(idle, { type: "closeSelection" })).toBe(idle)
    expect(filterDialogReducer(idle, { type: "closeConfigure" })).toBe(idle)
  })
})
