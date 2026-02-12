/**
 * Unit tests for layer tree keyboard logic.
 */
import { describe, expect, it } from "vitest"

import type { FlatLayerRow } from "./flatten"
import { nextLayerTreeStateFromKey } from "./keyboard"

describe("nextLayerTreeStateFromKey", () => {
  const rows: FlatLayerRow[] = [
    { node: { id: "root", kind: "artboard", label: "Root" }, depth: 0, hasChildren: true, isExpanded: true },
    { node: { id: "c1", kind: "image", label: "Child", parentId: "root" }, depth: 1, hasChildren: false, isExpanded: false },
  ]

  it("ArrowDown selects next row", () => {
    const r = nextLayerTreeStateFromKey({ key: "ArrowDown", selectedIndex: 0, rows })
    expect(r.preventDefault).toBe(true)
    expect(r.nextSelectedIndex).toBe(1)
    expect(r.selectId).toBe("c1")
  })

  it("Space toggles expansion when possible", () => {
    const r = nextLayerTreeStateFromKey({ key: " ", selectedIndex: 0, rows })
    expect(r.preventDefault).toBe(true)
    expect(r.toggleExpandId).toBe("root")
  })
})

