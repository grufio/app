/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react"
import { StrictMode } from "react"
import { describe, expect, it, vi } from "vitest"

import { useUpdateEffect } from "./use-update-effect"

describe("useUpdateEffect", () => {
  it("does not fire on initial mount", () => {
    const effect = vi.fn()
    renderHook(() => useUpdateEffect(effect, [0]))
    expect(effect).not.toHaveBeenCalled()
  })

  it("fires when a dependency changes after mount", () => {
    const effect = vi.fn()
    const { rerender } = renderHook(({ key }: { key: number }) => useUpdateEffect(effect, [key]), {
      initialProps: { key: 1 },
    })
    expect(effect).not.toHaveBeenCalled()
    rerender({ key: 2 })
    expect(effect).toHaveBeenCalledTimes(1)
  })

  it("fires every time deps change", () => {
    const effect = vi.fn()
    const { rerender } = renderHook(({ key }: { key: number }) => useUpdateEffect(effect, [key]), {
      initialProps: { key: 1 },
    })
    rerender({ key: 2 })
    rerender({ key: 3 })
    rerender({ key: 4 })
    expect(effect).toHaveBeenCalledTimes(3)
  })

  it("does not fire when deps stay the same across re-renders", () => {
    const effect = vi.fn()
    const { rerender } = renderHook(({ key }: { key: number }) => useUpdateEffect(effect, [key]), {
      initialProps: { key: 7 },
    })
    rerender({ key: 7 })
    rerender({ key: 7 })
    expect(effect).not.toHaveBeenCalled()
  })

  it("returns the cleanup callback on subsequent fires", () => {
    const cleanup = vi.fn()
    const effect = vi.fn(() => cleanup)
    const { rerender, unmount } = renderHook(
      ({ key }: { key: number }) => useUpdateEffect(effect, [key]),
      { initialProps: { key: 1 } },
    )
    rerender({ key: 2 })
    expect(cleanup).not.toHaveBeenCalled()
    rerender({ key: 3 })
    expect(cleanup).toHaveBeenCalledTimes(1) // cleanup from key=2 effect
    unmount()
    expect(cleanup).toHaveBeenCalledTimes(2) // cleanup from key=3 effect on unmount
  })

  it("does not fire on initial mount even under StrictMode", () => {
    const effect = vi.fn()
    renderHook(() => useUpdateEffect(effect, [0]), { wrapper: StrictMode })
    // StrictMode runs the component twice in dev. The hook's isFirstMountRef
    // is per-mount-cycle, so each mount's first effect pass is skipped.
    expect(effect).not.toHaveBeenCalled()
  })
})
