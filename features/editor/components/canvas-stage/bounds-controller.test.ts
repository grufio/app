/**
 * Unit tests for `bounds-controller`.
 *
 * Focus:
 * - Drag delta accumulation and flush semantics.
 */
import { describe, expect, it } from "vitest"

import { createBoundsController } from "./bounds-controller"
import type { BoundsRect } from "./types"

describe("createBoundsController", () => {
  it("flushDragBounds applies accumulated deltas to previous bounds", () => {
    let bounds: BoundsRect | null = { x: 1, y: 2, w: 3, h: 4 }
    const c = createBoundsController({
      imageDraggable: () => true,
      isE2E: () => false,
      rotationDeg: () => 0,
      getLayer: () => null,
      getImageNode: () => null,
      onBoundsChanged: (next) => {
        bounds = typeof next === "function" ? (next as (p: BoundsRect | null) => BoundsRect | null)(bounds) : next
      },
    })

    c.accumulateDragDelta(10, -5)
    c.flushDragBounds()
    expect(bounds).toEqual({ x: 11, y: -3, w: 3, h: 4 })
  })

  it("flushDragBounds fires onDragFlush with the accumulated world-px delta", () => {
    const flushed: Array<{ dx: number; dy: number }> = []
    const c = createBoundsController({
      imageDraggable: () => true,
      isE2E: () => false,
      rotationDeg: () => 0,
      getLayer: () => null,
      getImageNode: () => null,
      onBoundsChanged: () => {},
      onDragFlush: (dx, dy) => flushed.push({ dx, dy }),
    })

    c.accumulateDragDelta(3, 7)
    c.accumulateDragDelta(2, -1)
    c.flushDragBounds()
    expect(flushed).toEqual([{ dx: 5, dy: 6 }])

    // Second flush after no further accumulation is a no-op.
    c.flushDragBounds()
    expect(flushed).toEqual([{ dx: 5, dy: 6 }])
  })

  it("flushDragBounds skips both callbacks when no delta accumulated", () => {
    let onBoundsCalls = 0
    let onDragFlushCalls = 0
    const c = createBoundsController({
      imageDraggable: () => true,
      isE2E: () => false,
      rotationDeg: () => 0,
      getLayer: () => null,
      getImageNode: () => null,
      onBoundsChanged: () => {
        onBoundsCalls++
      },
      onDragFlush: () => {
        onDragFlushCalls++
      },
    })

    c.flushDragBounds()
    expect(onBoundsCalls).toBe(0)
    expect(onDragFlushCalls).toBe(0)
  })
})

