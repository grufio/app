import { describe, expect, it, vi } from "vitest"

import { chainHandlers } from "./chain-handlers"

describe("chainHandlers", () => {
  it("returns undefined when both handlers are undefined", () => {
    expect(chainHandlers<Event>(undefined, undefined)).toBeUndefined()
  })

  it("returns the user handler when only the user handler is set", () => {
    const user = vi.fn()
    const out = chainHandlers<string>(undefined, user)
    expect(out).toBe(user)
  })

  it("returns the built-in handler when only the built-in is set", () => {
    const builtin = vi.fn()
    const out = chainHandlers<string>(builtin, undefined)
    expect(out).toBe(builtin)
  })

  it("fires built-in before user, both with the same event", () => {
    const order: string[] = []
    const builtin = vi.fn(() => order.push("builtin"))
    const user = vi.fn(() => order.push("user"))
    const chained = chainHandlers<{ tag: string }>(builtin, user)
    chained?.({ tag: "evt" })
    expect(order).toEqual(["builtin", "user"])
    expect(builtin).toHaveBeenCalledWith({ tag: "evt" })
    expect(user).toHaveBeenCalledWith({ tag: "evt" })
  })

  it("does not swallow built-in when user throws", () => {
    const builtin = vi.fn()
    const user = vi.fn(() => {
      throw new Error("user failure")
    })
    const chained = chainHandlers<number>(builtin, user)
    expect(() => chained?.(1)).toThrow("user failure")
    // built-in still ran first.
    expect(builtin).toHaveBeenCalledOnce()
  })
})
