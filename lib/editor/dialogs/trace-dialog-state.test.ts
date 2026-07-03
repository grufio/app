import { describe, expect, it } from "vitest"

import {
  initialTraceDialogState,
  toTraceDialogSession,
  traceDialogReducer,
  type TraceDialogSession,
} from "./trace-dialog-state"

const session: TraceDialogSession = {
  sourceImageId: "img-1",
  sourceImageWidth: 320,
  sourceImageHeight: 240,
  sourceImageUrl: "https://example.test/img.png",
  displayMmW: 80,
  displayMmH: 60,
  contentRegion: null,
}

describe("toTraceDialogSession", () => {
  it("maps source-image shape to dialog-session shape", () => {
    expect(
      toTraceDialogSession({
        id: "img-1",
        width_px: 320,
        height_px: 240,
        signedUrl: "https://example.test/img.png",
        displayMmW: 80,
        displayMmH: 60,
      }),
    ).toEqual(session)
  })
})

describe("traceDialogReducer", () => {
  it("starts in idle", () => {
    expect(initialTraceDialogState).toEqual({ phase: "idle" })
  })

  it("beginSelection transitions idle -> selecting", () => {
    expect(
      traceDialogReducer(initialTraceDialogState, { type: "beginSelection", session }),
    ).toEqual({ phase: "selecting", session })
  })

  it("closeSelection from selecting returns to idle", () => {
    expect(
      traceDialogReducer({ phase: "selecting", session }, { type: "closeSelection" }),
    ).toEqual({ phase: "idle" })
  })

  it("selectKind in selecting advances to configuring", () => {
    expect(
      traceDialogReducer(
        { phase: "selecting", session },
        { type: "selectKind", kind: "pixelate" },
      ),
    ).toEqual({ phase: "configuring", session, kind: "pixelate" })

    expect(
      traceDialogReducer(
        { phase: "selecting", session },
        { type: "selectKind", kind: "lineart" },
      ),
    ).toEqual({ phase: "configuring", session, kind: "lineart" })
  })

  it("selectKind is a no-op outside the selecting phase", () => {
    expect(
      traceDialogReducer(initialTraceDialogState, {
        type: "selectKind",
        kind: "pixelate",
      }),
    ).toEqual({ phase: "idle" })
  })

  it("closeConfigure returns to idle", () => {
    expect(
      traceDialogReducer(
        { phase: "configuring", session, kind: "pixelate" },
        { type: "closeConfigure" },
      ),
    ).toEqual({ phase: "idle" })
  })

  it("reset returns to idle from any phase", () => {
    expect(
      traceDialogReducer({ phase: "selecting", session }, { type: "reset" }),
    ).toEqual({ phase: "idle" })
    expect(
      traceDialogReducer(
        { phase: "configuring", session, kind: "pixelate" },
        { type: "reset" },
      ),
    ).toEqual({ phase: "idle" })
  })

  it("reset / closeSelection / closeConfigure are idempotent on idle", () => {
    // The dialog-dismiss hook (`useTraceDialogSession`'s surfaceActive
    // effect) dispatches reset whenever the owning surface goes
    // inactive — even when the dialog is already idle. The reducer
    // must return the same reference so React skips the re-render.
    const idle = initialTraceDialogState
    expect(traceDialogReducer(idle, { type: "reset" })).toBe(idle)
    expect(traceDialogReducer(idle, { type: "closeSelection" })).toBe(idle)
    expect(traceDialogReducer(idle, { type: "closeConfigure" })).toBe(idle)
  })
})
