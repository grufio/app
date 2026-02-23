import { describe, expect, it, vi } from "vitest"

import { attachWindowMouseDragSession, type WindowLike } from "./window-mouse-session"

function makeWindowStub() {
  const listeners = new Map<string, Set<Function>>()
  const addEventListener: WindowLike["addEventListener"] = (type, listener) => {
    const key = String(type)
    const set = listeners.get(key) ?? new Set()
    set.add(listener as unknown as Function)
    listeners.set(key, set)
  }
  const removeEventListener: WindowLike["removeEventListener"] = (type, listener) => {
    const key = String(type)
    listeners.get(key)?.delete(listener as unknown as Function)
  }

  const dispatch = (type: string, evt: any) => {
    for (const fn of listeners.get(type) ?? []) fn(evt)
  }

  return { win: { addEventListener, removeEventListener } as WindowLike, dispatch, listeners }
}

describe("attachWindowMouseDragSession", () => {
  it("invokes handlers while attached", () => {
    const { win, dispatch } = makeWindowStub()
    const onMove = vi.fn()
    const onUp = vi.fn()

    attachWindowMouseDragSession({ win, onMove: onMove as any, onUp: onUp as any })
    dispatch("mousemove", { clientX: 1, clientY: 2 })
    dispatch("mouseup", {})

    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onUp).toHaveBeenCalledTimes(1)
  })

  it("removes listeners on cleanup so stale handlers cannot fire", () => {
    const { win, dispatch, listeners } = makeWindowStub()
    const onMove = vi.fn()
    const onUp = vi.fn()

    const cleanup = attachWindowMouseDragSession({ win, onMove: onMove as any, onUp: onUp as any })
    expect((listeners.get("mousemove")?.size ?? 0) + (listeners.get("mouseup")?.size ?? 0)).toBe(2)

    cleanup()
    dispatch("mousemove", { clientX: 1, clientY: 2 })
    dispatch("mouseup", {})

    expect(onMove).not.toHaveBeenCalled()
    expect(onUp).not.toHaveBeenCalled()
  })
})

