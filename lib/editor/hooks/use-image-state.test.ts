/**
 * Unit tests for `use-image-state` internals.
 *
 * Focus:
 * - Pending-slot semantics must not drop newer values during a flush.
 *   The slot is the only piece of state the hook owns; correctness of
 *   the save coalescing depends entirely on its set/clear ordering.
 */
import { describe, expect, it } from "vitest"

import { createPendingSlot } from "./use-image-state"

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

  it("clearAll wipes the slot regardless of seq", () => {
    const slot = createPendingSlot<string>()
    slot.set("a")
    slot.set("b")
    slot.clearAll()
    expect(slot.snapshot()).toBe(null)
  })
})
