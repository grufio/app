// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { useTraceDialogSession } from "./use-trace-dialog-session"

const sourceImage = {
  id: "img-1",
  width_px: 320,
  height_px: 240,
  signedUrl: "https://example.test/img.png",
  displayMmW: 80,
  displayMmH: 60,
}

describe("useTraceDialogSession — surface-active auto-dismiss", () => {
  // Regression guard: the user reported that opening a Trace dialog
  // and switching tabs to Image leaves the dialog open. The fix is
  // that the hook self-resets when its owning surface (the Trace
  // section) goes inactive — no shell-side wrapping required. Any
  // code path that flips `leftPanelTab` / `mobileSection` dismisses
  // the dialog automatically.

  it("auto-resets to idle when surfaceActive flips false mid-selection", () => {
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useTraceDialogSession(sourceImage, active),
      { initialProps: { active: true } },
    )

    act(() => {
      result.current.beginSelection()
    })
    expect(result.current.selectionOpen).toBe(true)

    rerender({ active: false })
    expect(result.current.selectionOpen).toBe(false)
    expect(result.current.activeKind).toBeNull()
  })

  it("auto-resets to idle when surfaceActive flips false mid-configure", () => {
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useTraceDialogSession(sourceImage, active),
      { initialProps: { active: true } },
    )

    act(() => {
      result.current.beginSelection()
      result.current.selectKind("pixelate")
    })
    expect(result.current.activeKind).toBe("pixelate")

    rerender({ active: false })
    expect(result.current.activeKind).toBeNull()
    expect(result.current.selectionOpen).toBe(false)
  })

  it("clears the error string when the surface goes inactive", () => {
    // beginSelection with null source sets an error; the auto-reset
    // must also clear it so the user doesn't return to the Trace tab
    // and see a stale "No active image" toast.
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useTraceDialogSession(null, active),
      { initialProps: { active: true } },
    )

    act(() => {
      result.current.beginSelection()
    })
    expect(result.current.error).not.toBe("")

    rerender({ active: false })
    expect(result.current.error).toBe("")
  })

  it("does NOT reset when surfaceActive stays true", () => {
    // Re-render with the same active value (e.g. an unrelated piece
    // of state changes elsewhere in the shell) must not collapse the
    // open dialog.
    const { result, rerender } = renderHook(
      ({ active, src }: { active: boolean; src: typeof sourceImage }) =>
        useTraceDialogSession(src, active),
      { initialProps: { active: true, src: sourceImage } },
    )

    act(() => {
      result.current.beginSelection()
      result.current.selectKind("pixelate")
    })
    expect(result.current.activeKind).toBe("pixelate")

    // Surface stays active; unrelated re-render.
    rerender({ active: true, src: { ...sourceImage } })
    expect(result.current.activeKind).toBe("pixelate")
  })

  it("re-opening on the Trace tab after dismissal starts from idle", () => {
    // User opens trace dialog, switches to Image (auto-reset),
    // switches back to Trace. State is idle — no leftover.
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useTraceDialogSession(sourceImage, active),
      { initialProps: { active: true } },
    )

    act(() => {
      result.current.beginSelection()
      result.current.selectKind("pixelate")
    })
    rerender({ active: false })
    rerender({ active: true })

    expect(result.current.selectionOpen).toBe(false)
    expect(result.current.activeKind).toBeNull()
  })
})
