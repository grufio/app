/**
 * Unit tests for `use-display-size` pure helpers.
 *
 * Focus:
 * - `createPendingSlot`: the save-coalescing slot must not drop newer
 *   values during a flush (set/clear ordering correctness).
 * - `imageStateToDisplayTxU`: the seed→tuple gate. Returns null only when
 *   there is no usable size; defaults missing x/y to 0n.
 */
import { describe, expect, it } from "vitest"

import { createPendingSlot, imageStateToDisplayTxU } from "./use-display-size"

describe("createPendingSlot", () => {
  it("does not clear a newer pending value when clearing an older seq", () => {
    const slot = createPendingSlot<number>()
    const seq1 = slot.set(1)
    expect(slot.snapshot()?.seq).toBe(seq1)
    expect(slot.snapshot()?.value).toBe(1)

    const seq2 = slot.set(2)
    expect(slot.snapshot()?.seq).toBe(seq2)
    expect(slot.snapshot()?.value).toBe(2)

    expect(slot.clearIfSeq(seq1)).toBe(false)
    expect(slot.snapshot()?.value).toBe(2)

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

describe("imageStateToDisplayTxU", () => {
  const valid = { xPxU: 10n, yPxU: 20n, widthPxU: 100n, heightPxU: 200n, rotationDeg: 0 }

  it("returns null for null/undefined input", () => {
    expect(imageStateToDisplayTxU(null)).toBe(null)
    expect(imageStateToDisplayTxU(undefined)).toBe(null)
  })

  it("returns null when width is absent or non-positive", () => {
    expect(imageStateToDisplayTxU({ ...valid, widthPxU: undefined })).toBe(null)
    expect(imageStateToDisplayTxU({ ...valid, widthPxU: 0n })).toBe(null)
    expect(imageStateToDisplayTxU({ ...valid, widthPxU: -1n })).toBe(null)
  })

  it("returns null when height is absent or non-positive", () => {
    expect(imageStateToDisplayTxU({ ...valid, heightPxU: undefined })).toBe(null)
    expect(imageStateToDisplayTxU({ ...valid, heightPxU: 0n })).toBe(null)
  })

  it("returns the full tuple when valid", () => {
    expect(imageStateToDisplayTxU(valid)).toEqual({ x: 10n, y: 20n, w: 100n, h: 200n })
  })

  it("defaults missing x/y to 0n (SSR rows may omit position)", () => {
    expect(imageStateToDisplayTxU({ widthPxU: 100n, heightPxU: 200n, rotationDeg: 0 })).toEqual({
      x: 0n,
      y: 0n,
      w: 100n,
      h: 200n,
    })
  })
})
