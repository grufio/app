/**
 * Unit tests for the thin Konva adapter wrappers.
 *
 * The wrappers exist precisely so we can mock Konva at the seam; the
 * tests therefore verify the wrappers forward arguments correctly and
 * shape the return value as expected — nothing more.
 */
import { describe, expect, it } from "vitest"
import type Konva from "konva"

import { getClientRectRelative, getNodeXY, setNodeXY } from "./konva-adapters"

describe("getClientRectRelative", () => {
  it("forwards relativeTo to getClientRect and returns its result", () => {
    const layer = { layer: true } as unknown as Konva.Layer
    let captured: { relativeTo?: Konva.Node } | undefined
    const rect = { x: 5, y: 6, width: 7, height: 8 }
    const node = {
      getClientRect: (config?: { relativeTo?: Konva.Node }) => {
        captured = config
        return rect
      },
    } as unknown as Konva.Node
    expect(getClientRectRelative(node, layer)).toBe(rect)
    expect(captured?.relativeTo).toBe(layer)
  })
})

describe("getNodeXY", () => {
  it("returns { x, y } from the node accessors", () => {
    const node = {
      x: () => 11,
      y: () => 22,
    } as unknown as Konva.Node
    expect(getNodeXY(node)).toEqual({ x: 11, y: 22 })
  })
})

describe("setNodeXY", () => {
  it("calls x() then y() with the provided values", () => {
    const calls: Array<["x" | "y", number]> = []
    const node = {
      x: ((v: number) => calls.push(["x", v])) as unknown as Konva.Node["x"],
      y: ((v: number) => calls.push(["y", v])) as unknown as Konva.Node["y"],
    } as unknown as Konva.Node
    setNodeXY(node, 3, 4)
    expect(calls).toEqual([
      ["x", 3],
      ["y", 4],
    ])
  })
})
