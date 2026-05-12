import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { waitForStateChange, type AnyActorLike } from "./wait-for-state-change"

type Snap = { value: string }

function createMockActor(): {
  actor: AnyActorLike<Snap>
  emit: (snap: Snap) => void
  unsubscribed: () => boolean
  subscribeThrows: (err: Error) => void
} {
  let listener: ((s: Snap) => void) | null = null
  let unsubscribed = false
  let thrownErr: Error | null = null
  return {
    actor: {
      subscribe: (next) => {
        if (thrownErr) throw thrownErr
        listener = next
        return {
          unsubscribe: () => {
            unsubscribed = true
            listener = null
          },
        }
      },
    },
    emit: (snap) => listener?.(snap),
    unsubscribed: () => unsubscribed,
    subscribeThrows: (err) => { thrownErr = err },
  }
}

describe("waitForStateChange", () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it("resolves on first 'resolve' verdict and unsubscribes", async () => {
    const mock = createMockActor()
    const p = waitForStateChange<Snap>({
      actor: mock.actor,
      timeoutMs: 1000,
      timeoutMessage: "timeout",
      evaluate: (s) => (s.value === "done" ? "resolve" : null),
    })
    mock.emit({ value: "intermediate" })
    mock.emit({ value: "done" })
    await expect(p).resolves.toBeUndefined()
    expect(mock.unsubscribed()).toBe(true)
  })

  it("rejects on first Error verdict and unsubscribes", async () => {
    const mock = createMockActor()
    const p = waitForStateChange<Snap>({
      actor: mock.actor,
      timeoutMs: 1000,
      timeoutMessage: "timeout",
      evaluate: (s) => (s.value === "boom" ? new Error("kaboom") : null),
    })
    mock.emit({ value: "boom" })
    await expect(p).rejects.toThrow("kaboom")
    expect(mock.unsubscribed()).toBe(true)
  })

  it("rejects with the timeout message after timeoutMs and unsubscribes", async () => {
    const mock = createMockActor()
    const p = waitForStateChange<Snap>({
      actor: mock.actor,
      timeoutMs: 500,
      timeoutMessage: "took too long",
      evaluate: () => null,
    })
    vi.advanceTimersByTime(500)
    await expect(p).rejects.toThrow("took too long")
    expect(mock.unsubscribed()).toBe(true)
  })

  it("rejects (no TDZ) when subscribe throws synchronously", async () => {
    const mock = createMockActor()
    mock.subscribeThrows(new Error("subscribe failed"))
    const p = waitForStateChange<Snap>({
      actor: mock.actor,
      timeoutMs: 500,
      timeoutMessage: "timeout",
      evaluate: () => null,
    })
    await expect(p).rejects.toThrow("subscribe failed")
  })

  it("ignores snapshots emitted after settlement (no double-settle)", async () => {
    const mock = createMockActor()
    const evaluate = vi.fn((s: Snap) => (s.value === "done" ? "resolve" : null) as null | "resolve" | Error)
    const p = waitForStateChange<Snap>({
      actor: mock.actor,
      timeoutMs: 1000,
      timeoutMessage: "timeout",
      evaluate,
    })
    mock.emit({ value: "done" })
    await p
    mock.emit({ value: "again" })
    // evaluate should not have been called on the post-settle emit.
    expect(evaluate).toHaveBeenCalledTimes(1)
  })

  it("invokes onSettle exactly once on resolve", async () => {
    const mock = createMockActor()
    const onSettle = vi.fn()
    const p = waitForStateChange<Snap>({
      actor: mock.actor,
      timeoutMs: 1000,
      timeoutMessage: "timeout",
      evaluate: (s) => (s.value === "done" ? "resolve" : null),
      onSettle,
    })
    mock.emit({ value: "done" })
    await p
    expect(onSettle).toHaveBeenCalledTimes(1)
  })

  it("invokes onSettle exactly once on timeout", async () => {
    const mock = createMockActor()
    const onSettle = vi.fn()
    const p = waitForStateChange<Snap>({
      actor: mock.actor,
      timeoutMs: 100,
      timeoutMessage: "timeout",
      evaluate: () => null,
      onSettle,
    })
    vi.advanceTimersByTime(100)
    await expect(p).rejects.toThrow("timeout")
    expect(onSettle).toHaveBeenCalledTimes(1)
  })

  it("invokes onSettle exactly once on reject-by-evaluate", async () => {
    const mock = createMockActor()
    const onSettle = vi.fn()
    const p = waitForStateChange<Snap>({
      actor: mock.actor,
      timeoutMs: 1000,
      timeoutMessage: "timeout",
      evaluate: (s) => (s.value === "fail" ? new Error("x") : null),
      onSettle,
    })
    mock.emit({ value: "fail" })
    await expect(p).rejects.toThrow("x")
    expect(onSettle).toHaveBeenCalledTimes(1)
  })
})
