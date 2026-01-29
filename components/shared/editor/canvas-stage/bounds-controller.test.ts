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
})

