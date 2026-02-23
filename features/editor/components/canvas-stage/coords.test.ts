import { describe, expect, it } from "vitest"

import { clientToWorldPoint } from "./coords"

describe("clientToWorldPoint", () => {
  it("maps client coordinates using view offset/scale", () => {
    const rect = { left: 100, top: 50 } as DOMRect
    const out = clientToWorldPoint({
      clientX: 190,
      clientY: 140,
      containerRect: rect,
      view: { x: 10, y: 20, scale: 2 },
    })
    expect(out).toEqual({ worldX: 40, worldY: 35 })
  })

  it("handles near-zero scale safely", () => {
    const rect = { left: 0, top: 0 } as DOMRect
    const out = clientToWorldPoint({
      clientX: 1,
      clientY: 1,
      containerRect: rect,
      view: { x: 0, y: 0, scale: 0 },
    })
    expect(Number.isFinite(out.worldX)).toBe(true)
    expect(Number.isFinite(out.worldY)).toBe(true)
  })
})
