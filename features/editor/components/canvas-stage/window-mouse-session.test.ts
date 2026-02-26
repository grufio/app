import { describe, expect, it, vi } from "vitest"

import { attachWindowMouseDragSession, type WindowLike } from "./window-mouse-session"

function makeWindowStub() {
  type MouseListener = (evt: MouseEvent) => void
  const listeners = new Map<string, Set<MouseListener>>()
  const addEventListener: WindowLike["addEventListener"] = (type, listener) => {
    const key = String(type)
    const set = listeners.get(key) ?? new Set()
    if (typeof listener === "function") {
      set.add(listener as MouseListener)
    } else {
      set.add(((evt: MouseEvent) => listener.handleEvent(evt)) as MouseListener)
    }
    listeners.set(key, set)
  }
  const removeEventListener: WindowLike["removeEventListener"] = (type, listener) => {
    const key = String(type)
    if (typeof listener === "function") {
      listeners.get(key)?.delete(listener as MouseListener)
    }
  }

  const dispatch = (type: string, evt: MouseEvent) => {
    for (const fn of listeners.get(type) ?? []) fn(evt)
  }

  return { win: { addEventListener, removeEventListener } as WindowLike, dispatch, listeners }
}

describe("attachWindowMouseDragSession", () => {
  it("invokes handlers while attached", () => {
    const { win, dispatch } = makeWindowStub()
    const onMove = vi.fn()
    const onUp = vi.fn()

    attachWindowMouseDragSession({ win, onMove, onUp })
    dispatch("mousemove", { clientX: 1, clientY: 2 } as MouseEvent)
    dispatch("mouseup", {} as MouseEvent)

    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onUp).toHaveBeenCalledTimes(1)
  })

  it("removes listeners on cleanup so stale handlers cannot fire", () => {
    const { win, dispatch, listeners } = makeWindowStub()
    const onMove = vi.fn()
    const onUp = vi.fn()

    const cleanup = attachWindowMouseDragSession({ win, onMove, onUp })
    expect((listeners.get("mousemove")?.size ?? 0) + (listeners.get("mouseup")?.size ?? 0)).toBe(2)

    cleanup()
    dispatch("mousemove", { clientX: 1, clientY: 2 } as MouseEvent)
    dispatch("mouseup", {} as MouseEvent)

    expect(onMove).not.toHaveBeenCalled()
    expect(onUp).not.toHaveBeenCalled()
  })
})

