import { describe, expect, it } from "vitest"

import { createStateSyncGuard } from "./state-sync-guard"

function flushMicrotasks() {
  return new Promise<void>((resolve) => queueMicrotask(() => resolve()))
}

describe("state-sync-guard", () => {
  it("applies when not superseded and not user-changed", async () => {
    const g = createStateSyncGuard()
    let applied = 0
    g.scheduleApply("k1", () => {
      applied += 1
    })
    await flushMicrotasks()
    expect(applied).toBe(1)
  })

  it("does not apply if superseded by a later scheduleApply", async () => {
    const g = createStateSyncGuard()
    const applied: string[] = []
    g.scheduleApply("k1", () => applied.push("first"))
    g.scheduleApply("k2", () => applied.push("second"))
    await flushMicrotasks()
    expect(applied).toEqual(["second"])
  })

  it("does not apply if the user changes after scheduling", async () => {
    const g = createStateSyncGuard()
    let applied = 0
    g.scheduleApply("k1", () => {
      applied += 1
    })
    g.markUserChanged()
    await flushMicrotasks()
    expect(applied).toBe(0)
  })

  it("resetForNewImage cancels queued applies and clears flags", async () => {
    const g = createStateSyncGuard()
    let applied = 0
    g.scheduleApply("k1", () => {
      applied += 1
    })
    g.resetForNewImage()
    await flushMicrotasks()
    expect(applied).toBe(0)
    expect(g.getAppliedKey()).toBe(null)
    expect(g.hasUserChanged()).toBe(false)
  })
})

