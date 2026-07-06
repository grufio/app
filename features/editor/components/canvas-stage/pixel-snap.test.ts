/**
 * Unit tests for `pixel-snap`.
 *
 * Focus:
 * - Half-pixel snapping under different view scales and offsets.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import { snapWorldToDeviceHalfPixel } from "./pixel-snap"

describe("snapWorldToDeviceHalfPixel", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // Node env: `window` is undefined → dpr falls back to 1.
  it("snaps to half-pixels at scale=1, offset=0 (dpr=1)", () => {
    const view = { scale: 1, x: 0, y: 0 }
    expect(snapWorldToDeviceHalfPixel({ worldCoord: 0, axis: "x", view })).toBe(0.5)
    expect(snapWorldToDeviceHalfPixel({ worldCoord: 10, axis: "x", view })).toBe(10.5)
  })

  it("accounts for view offset and scale (dpr=1)", () => {
    const view = { scale: 2, x: 10, y: -5 }
    // screen = offset + world*scale
    // world=0, axis=x => screen=10 => snapped=9.5? round(9.5)=10 => 10.5 => world=(10.5-10)/2=0.25
    expect(snapWorldToDeviceHalfPixel({ worldCoord: 0, axis: "x", view })).toBe(0.25)
  })

  it("snaps to HALF DEVICE pixels on a 2× display", () => {
    vi.stubGlobal("window", { devicePixelRatio: 2 })
    const view = { scale: 1, x: 0, y: 0 }
    // screenDev = screen*2; center on N+0.5 device px; back to CSS px = /2.
    // world=0  => screenDev=0  => (round(-0.5)+0.5)/2 = 0.25
    // world=10 => screenDev=20 => (round(19.5)+0.5)/2 = 10.25
    expect(snapWorldToDeviceHalfPixel({ worldCoord: 0, axis: "x", view })).toBe(0.25)
    expect(snapWorldToDeviceHalfPixel({ worldCoord: 10, axis: "x", view })).toBe(10.25)
  })
})

