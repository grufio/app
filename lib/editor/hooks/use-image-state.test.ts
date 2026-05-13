/**
 * Unit tests for `use-image-state` internals.
 *
 * Focus:
 * - Pending-slot semantics must not drop newer values during a flush.
 * - `decideEnabledEffectAction` preserves the SSR seed across a
 *   `enabled: false → true` transition. Regression gate for the bug
 *   where the disable branch wiped `initialImageTransform` and the
 *   re-enable branch early-returned without restoring it, so the
 *   canvas defaulted to fit-placement on every project reopen.
 */
import { describe, expect, it } from "vitest"

import { createPendingSlot, decideEnabledEffectAction } from "./use-image-state"

describe("createPendingSlot", () => {
  it("does not clear a newer pending value when clearing an older seq", () => {
    const slot = createPendingSlot<number>()
    const seq1 = slot.set(1)
    const snap1 = slot.snapshot()
    expect(snap1?.seq).toBe(seq1)
    expect(snap1?.value).toBe(1)

    const seq2 = slot.set(2)
    const snap2 = slot.snapshot()
    expect(snap2?.seq).toBe(seq2)
    expect(snap2?.value).toBe(2)

    // Attempting to clear the old seq must not clear the newer value.
    expect(slot.clearIfSeq(seq1)).toBe(false)
    expect(slot.snapshot()?.value).toBe(2)

    // Clearing the latest seq should clear.
    expect(slot.clearIfSeq(seq2)).toBe(true)
    expect(slot.snapshot()).toBe(null)
  })
})

describe("decideEnabledEffectAction", () => {
  it("returns `preserve` while disabled — never `wipe` — so the SSR seed survives the initial loading window", () => {
    // Project reopen: enabled starts false because `filterImageLoadedOnce`
    // begins false. If this branch wiped `initialImageTransform`, the
    // subsequent enable would early-return (skip_load) without restoring
    // the seed, and the canvas would always render at default fit size.
    expect(decideEnabledEffectAction({ enabled: false, hasInitial: true, autoLoad: true })).toBe("preserve")
    expect(decideEnabledEffectAction({ enabled: false, hasInitial: false, autoLoad: true })).toBe("preserve")
    expect(decideEnabledEffectAction({ enabled: false, hasInitial: true, autoLoad: false })).toBe("preserve")
  })

  it("skips load when enabled and SSR seed is present", () => {
    expect(decideEnabledEffectAction({ enabled: true, hasInitial: true, autoLoad: true })).toBe("skip_load")
    expect(decideEnabledEffectAction({ enabled: true, hasInitial: true, autoLoad: false })).toBe("skip_load")
  })

  it("triggers a load when enabled without seed and autoLoad is on", () => {
    expect(decideEnabledEffectAction({ enabled: true, hasInitial: false, autoLoad: true })).toBe("trigger_load")
  })

  it("is a noop when enabled without seed and autoLoad is off (caller drives loads)", () => {
    expect(decideEnabledEffectAction({ enabled: true, hasInitial: false, autoLoad: false })).toBe("noop")
  })
})
