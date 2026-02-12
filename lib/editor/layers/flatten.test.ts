/**
 * Unit tests for layer tree flattening.
 */
import { describe, expect, it } from "vitest"

import type { LayerNode } from "@/lib/editor/layers-tree"
import { flattenLayerTree } from "./flatten"

describe("flattenLayerTree", () => {
  it("includes root and expanded children", () => {
    const root: LayerNode = {
      id: "root",
      kind: "artboard",
      label: "Root",
      children: [{ id: "c1", kind: "image", label: "Child", parentId: "root" }],
    }
    const rowsCollapsed = flattenLayerTree(root, new Set(["root"]))
    expect(rowsCollapsed.map((r) => r.node.id)).toEqual(["root", "c1"])
  })
})

