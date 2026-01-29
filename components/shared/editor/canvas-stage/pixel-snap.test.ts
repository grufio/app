/**
 * Unit tests for `pixel-snap`.
 *
 * Focus:
 * - Half-pixel snapping under different view scales and offsets.
 */
import { describe, expect, it } from "vitest"

import { snapWorldToDeviceHalfPixel } from "./pixel-snap"

describe("snapWorldToDeviceHalfPixel", () => {
  it("snaps to half-pixels at scale=1, offset=0", () => {
    const view = { scale: 1, x: 0, y: 0 }
    expect(snapWorldToDeviceHalfPixel({ worldCoord: 0, axis: "x", view })).toBe(0.5)
    expect(snapWorldToDeviceHalfPixel({ worldCoord: 10, axis: "x", view })).toBe(10.5)
  })

  it("accounts for view offset and scale", () => {
    const view = { scale: 2, x: 10, y: -5 }
    // screen = offset + world*scale
    // world=0, axis=x => screen=10 => snapped=9.5? round(9.5)=10 => 10.5 => world=(10.5-10)/2=0.25
    expect(snapWorldToDeviceHalfPixel({ worldCoord: 0, axis: "x", view })).toBe(0.25)
  })
})

