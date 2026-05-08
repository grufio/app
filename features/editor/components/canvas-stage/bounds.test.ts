/**
 * Unit tests for canvas-stage bounds helpers.
 */
import { describe, expect, it } from "vitest"
import type Konva from "konva"

import { boundsFromNodeClientRect, boundsFromNodeNoRotation, shouldUpdateBounds } from "./bounds"

describe("boundsFromNodeNoRotation", () => {
  it("centers the rect on the node's (x, y)", () => {
    const node = {
      width: () => 100,
      height: () => 60,
      x: () => 50,
      y: () => 30,
    }
    expect(boundsFromNodeNoRotation(node)).toEqual({ x: 0, y: 0, w: 100, h: 60 })
  })

  it("works with negative origins", () => {
    const node = {
      width: () => 20,
      height: () => 40,
      x: () => -100,
      y: () => -200,
    }
    expect(boundsFromNodeNoRotation(node)).toEqual({ x: -110, y: -220, w: 20, h: 40 })
  })
})

describe("boundsFromNodeClientRect", () => {
  it("forwards getClientRect with relativeTo and reshapes the result", () => {
    const layer = {} as Konva.Node
    let captured: { relativeTo?: Konva.Node } | undefined
    const node = {
      getClientRect: (config?: { relativeTo?: Konva.Node }) => {
        captured = config
        return { x: 1, y: 2, width: 3, height: 4 }
      },
    }
    expect(boundsFromNodeClientRect(node, layer)).toEqual({ x: 1, y: 2, w: 3, h: 4 })
    expect(captured?.relativeTo).toBe(layer)
  })
})

describe("shouldUpdateBounds", () => {
  it("returns true when prev is null (first measurement)", () => {
    expect(shouldUpdateBounds(null, { x: 0, y: 0, w: 1, h: 1 })).toBe(true)
  })

  it("returns false when next is within the default epsilon", () => {
    const prev = { x: 10, y: 20, w: 30, h: 40 }
    const next = { x: 10.005, y: 20.001, w: 30, h: 40 }
    expect(shouldUpdateBounds(prev, next)).toBe(false)
  })

  it("returns true when any axis exceeds the default epsilon", () => {
    const prev = { x: 10, y: 20, w: 30, h: 40 }
    const next = { x: 10.5, y: 20, w: 30, h: 40 }
    expect(shouldUpdateBounds(prev, next)).toBe(true)
  })

  it("respects a custom epsilon", () => {
    const prev = { x: 0, y: 0, w: 0, h: 0 }
    const next = { x: 0.5, y: 0, w: 0, h: 0 }
    expect(shouldUpdateBounds(prev, next, 1)).toBe(false)
    expect(shouldUpdateBounds(prev, next, 0.1)).toBe(true)
  })
})
