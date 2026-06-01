// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { useFilterDialogSession } from "./use-filter-dialog-session"

const sourceImage = {
  id: "img-1",
  width_px: 320,
  height_px: 240,
  signedUrl: "https://example.test/img.png",
}

// Twin of `use-trace-dialog-session.test.ts` — same auto-dismiss
// contract on the Filter surface, asserted independently so a future
// divergence between the two hooks fails one of the two suites.
describe("useFilterDialogSession — surface-active auto-dismiss", () => {
  it("auto-resets to idle when surfaceActive flips false mid-selection", () => {
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useFilterDialogSession(sourceImage, active),
      { initialProps: { active: true } },
    )

    act(() => {
      result.current.beginSelection()
    })
    expect(result.current.selectionOpen).toBe(true)

    rerender({ active: false })
    expect(result.current.selectionOpen).toBe(false)
    expect(result.current.activeFilterType).toBeNull()
  })

  it("auto-resets to idle when surfaceActive flips false mid-configure", () => {
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useFilterDialogSession(sourceImage, active),
      { initialProps: { active: true } },
    )

    act(() => {
      result.current.beginSelection()
      result.current.selectFilterType("bw_hard")
    })
    expect(result.current.activeFilterType).toBe("bw_hard")

    rerender({ active: false })
    expect(result.current.activeFilterType).toBeNull()
    expect(result.current.selectionOpen).toBe(false)
  })

  it("clears the error string when the surface goes inactive", () => {
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useFilterDialogSession(null, active),
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
    const { result, rerender } = renderHook(
      ({ active, src }: { active: boolean; src: typeof sourceImage }) =>
        useFilterDialogSession(src, active),
      { initialProps: { active: true, src: sourceImage } },
    )

    act(() => {
      result.current.beginSelection()
      result.current.selectFilterType("bw_hard")
    })
    expect(result.current.activeFilterType).toBe("bw_hard")

    rerender({ active: true, src: { ...sourceImage } })
    expect(result.current.activeFilterType).toBe("bw_hard")
  })

  it("re-opening on the Filter tab after dismissal starts from idle", () => {
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useFilterDialogSession(sourceImage, active),
      { initialProps: { active: true } },
    )

    act(() => {
      result.current.beginSelection()
      result.current.selectFilterType("bw_hard")
    })
    rerender({ active: false })
    rerender({ active: true })

    expect(result.current.selectionOpen).toBe(false)
    expect(result.current.activeFilterType).toBeNull()
  })
})
