import { describe, expect, it } from "vitest"

import { createRateLimiter } from "./rate-limit-bucket"

function clock(start = 1_000) {
  let t = start
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms
    },
  }
}

describe("createRateLimiter", () => {
  it("allows up to maxPerWindow hits, then limits within the window", () => {
    const c = clock()
    const rl = createRateLimiter({ maxPerWindow: 3, windowMs: 60_000, maxKeys: 100, now: c.now })
    expect(rl.limited("a")).toBe(false) // 1
    expect(rl.limited("a")).toBe(false) // 2
    expect(rl.limited("a")).toBe(false) // 3
    expect(rl.limited("a")).toBe(true) // 4 — over
    expect(rl.limited("a")).toBe(true) // 5 — still over
  })

  it("tracks keys independently", () => {
    const c = clock()
    const rl = createRateLimiter({ maxPerWindow: 1, windowMs: 60_000, maxKeys: 100, now: c.now })
    expect(rl.limited("a")).toBe(false)
    expect(rl.limited("b")).toBe(false)
    expect(rl.limited("a")).toBe(true)
    expect(rl.limited("b")).toBe(true)
  })

  it("resets a key's count once its window elapses", () => {
    const c = clock()
    const rl = createRateLimiter({ maxPerWindow: 1, windowMs: 60_000, maxKeys: 100, now: c.now })
    expect(rl.limited("a")).toBe(false)
    expect(rl.limited("a")).toBe(true)
    c.advance(60_001)
    expect(rl.limited("a")).toBe(false) // fresh window
  })

  it("sweeps expired entries so one-shot keys don't accumulate", () => {
    const c = clock()
    const rl = createRateLimiter({ maxPerWindow: 10, windowMs: 60_000, maxKeys: 10_000, now: c.now })
    for (let i = 0; i < 50; i++) rl.limited(`ip-${i}`)
    expect(rl.size()).toBe(50)
    // Advance past the window and touch a single key — triggers the sweep,
    // which drops all 50 now-expired entries and leaves just the fresh one.
    c.advance(60_001)
    rl.limited("newcomer")
    expect(rl.size()).toBe(1)
  })

  it("does not sweep more than once per window", () => {
    const c = clock()
    const rl = createRateLimiter({ maxPerWindow: 10, windowMs: 60_000, maxKeys: 10_000, now: c.now })
    rl.limited("a")
    c.advance(30_000)
    rl.limited("b") // within the same window as the last sweep → no sweep
    expect(rl.size()).toBe(2)
  })

  it("enforces the hard cap during a single-window flood of unique keys", () => {
    const c = clock()
    const rl = createRateLimiter({ maxPerWindow: 10, windowMs: 60_000, maxKeys: 5, now: c.now })
    // 20 unique keys within one window — sweep can't age any out yet.
    for (let i = 0; i < 20; i++) rl.limited(`ip-${i}`)
    expect(rl.size()).toBeLessThanOrEqual(5)
  })

  it("never evicts the key just recorded when hitting the cap", () => {
    const c = clock()
    const rl = createRateLimiter({ maxPerWindow: 10, windowMs: 60_000, maxKeys: 1, now: c.now })
    rl.limited("first")
    rl.limited("second")
    // Cap is 1; "second" was just inserted and must survive — a follow-up hit
    // in the same window must see its existing count, not a fresh entry.
    expect(rl.size()).toBe(1)
    expect(rl.limited("second")).toBe(false) // count 2, under maxPerWindow=10
  })
})
