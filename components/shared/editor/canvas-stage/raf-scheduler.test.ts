import { describe, expect, it, vi } from "vitest"

import { createRafScheduler, RAF_BOUNDS, RAF_DRAG_BOUNDS, RAF_PAN } from "./raf-scheduler"

describe("createRafScheduler", () => {
  it("coalesces multiple schedule calls into one frame", () => {
    const rafQueue: Array<FrameRequestCallback> = []
    const req = vi.fn((cb: FrameRequestCallback) => {
      rafQueue.push(cb)
      return 1
    })
    vi.stubGlobal("requestAnimationFrame", req)

    const calls: string[] = []
    const s = createRafScheduler({
      onPan: () => calls.push("pan"),
      onDragBounds: () => calls.push("drag"),
      onBounds: () => calls.push("bounds"),
    })

    s.schedule(RAF_PAN)
    s.schedule(RAF_BOUNDS)
    s.schedule(RAF_DRAG_BOUNDS)
    expect(rafQueue.length).toBe(1)

    rafQueue[0](0)
    expect(calls).toEqual(["pan", "drag", "bounds"])

    vi.unstubAllGlobals()
  })

  it("dispose cancels pending frame", () => {
    const rafQueue: Array<FrameRequestCallback> = []
    const req = vi.fn((cb: FrameRequestCallback) => {
      rafQueue.push(cb)
      return 123
    })
    const cancel = vi.fn(() => {})
    vi.stubGlobal("requestAnimationFrame", req)
    vi.stubGlobal("cancelAnimationFrame", cancel)

    const s = createRafScheduler({ onPan: () => {}, onDragBounds: () => {}, onBounds: () => {} })
    s.schedule(RAF_PAN)
    s.dispose()
    expect(cancel).toHaveBeenCalledWith(123)

    vi.unstubAllGlobals()
  })
})

