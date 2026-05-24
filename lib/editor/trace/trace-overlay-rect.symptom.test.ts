/**
 * Schritt-1 symptom measurement (no fix applied yet).
 *
 * Replicates the CURRENT `traceRect` derivation from
 * `project-canvas-stage.tsx` verbatim, then measures — in world px — what
 * rect the trace overlay receives once the base image has been moved+resized
 * after the trace was applied. This objectively reproduces the user's
 * "trace always sticks in the source image" report.
 *
 * Fixture (prod project 2d15eeeb, read-only psql):
 *   trace display_*: 283.464567 × 566.929134 px @ center (297.5, 421.0)
 *
 * Scenario: user resizes/moves the base image after apply, so the live
 * `imageRender` now differs from the trace's frozen display rect.
 */
import { describe, expect, it } from "vitest"

import { resolveTraceWorldSize } from "./trace-overlay-rect"

type Rect = { x: number; y: number; width: number; height: number }

/** The CURRENT (pre-fix) derivation, copied verbatim from
 * project-canvas-stage.tsx lines 607-617. `traceOverlayCenter` tracks the
 * live image center (it is re-synced to `imageRender.x/y` on every commit),
 * so for a settled canvas it equals `imageRender`'s center. */
function currentTraceRect(args: {
  imageRender: Rect
  traceOverlayCenter: { x: number; y: number }
  displayRect: {
    display_x_px_u: string
    display_y_px_u: string
    display_width_px_u: string
    display_height_px_u: string
  }
}): Rect {
  const { imageRender, traceOverlayCenter, displayRect } = args
  const traceWorldSize = resolveTraceWorldSize(displayRect)
  const center = traceOverlayCenter ?? { x: imageRender.x, y: imageRender.y }
  if (!traceWorldSize) {
    return { x: center.x, y: center.y, width: imageRender.width, height: imageRender.height }
  }
  return { x: center.x, y: center.y, width: traceWorldSize.width, height: traceWorldSize.height }
}

describe("CURRENT traceRect derivation — symptom proof", () => {
  const displayRect = {
    display_x_px_u: "297500000", // 297.5 px (trace's OWN center)
    display_y_px_u: "421000000", // 421.0 px
    display_width_px_u: "283464567", // 283.46 px
    display_height_px_u: "566929134", // 566.93 px
  }

  it("POSITION sticks to the moved base image, NOT the trace's own display_x/y", () => {
    // User dragged the base image to a new center far from the apply-time
    // origin, and resized it larger.
    const imageRender: Rect = { x: 600, y: 200, width: 800, height: 800 }
    const rect = currentTraceRect({
      imageRender,
      traceOverlayCenter: { x: imageRender.x, y: imageRender.y },
      displayRect,
    })

    // SIZE is already correct (PR #280 fixed this): own 283×567.
    expect(rect.width).toBeCloseTo(283.464567, 4)
    expect(rect.height).toBeCloseTo(566.929134, 4)

    // POSITION is the BUG: it follows the live base-image center (600/200)
    // instead of the trace's own display_x/y (297.5/421.0). This is the
    // un-fixed half — the trace "sticks in the source image".
    expect(rect.x).toBe(600)
    expect(rect.y).toBe(200)
    expect(rect.x).not.toBeCloseTo(297.5, 1)
    expect(rect.y).not.toBeCloseTo(421, 1)
  })
})
