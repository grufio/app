import { describe, expect, it } from "vitest"

import type { EditorTreeItem } from "./EditorTreeView"
import { __private__ } from "./EditorTreeView"

function sampleItems(): EditorTreeItem[] {
  return [
    {
      id: "artboard",
      label: "Artboard",
      children: [
        { id: "image:1", label: "Image A" },
        {
          id: "image:2",
          label: "Image B",
          children: [{ id: "filter:2:1", label: "Filter 1" }],
        },
      ],
    },
    {
      id: "settings",
      label: "Settings",
      children: [{ id: "general", label: "General" }],
    },
  ]
}

describe("EditorTreeView helpers", () => {
  it("flattens visible tree based on expanded set", () => {
    const items = sampleItems()
    const expanded = __private__.toExpandedSet(["artboard", "image:2"])
    const rows = __private__.flattenVisibleTree(items, expanded)

    expect(rows.map((r) => r.item.id)).toEqual([
      "artboard",
      "image:1",
      "image:2",
      "filter:2:1",
      "settings",
    ])
    expect(rows.find((r) => r.item.id === "filter:2:1")?.depth).toBe(2)
  })

  it("ArrowRight expands a collapsed parent", () => {
    const items = sampleItems()
    const expanded = __private__.toExpandedSet([]) // nothing expanded
    const rows = __private__.flattenVisibleTree(items, expanded)
    const focusedIndex = 0 // artboard

    const res = __private__.nextActionFromKey({
      key: "ArrowRight",
      rows,
      focusedIndex,
      typeaheadQuery: "",
    })

    expect(res.preventDefault).toBe(true)
    expect(res.action).toEqual({ kind: "toggle", id: "artboard", nextExpanded: true })
  })

  it("Enter toggles parent expand/collapse; leaf activates", () => {
    const items = sampleItems()
    const expanded = __private__.toExpandedSet(["artboard"]) // show children
    const rows = __private__.flattenVisibleTree(items, expanded)

    // Focus parent (artboard) -> toggle
    {
      const res = __private__.nextActionFromKey({
        key: "Enter",
        rows,
        focusedIndex: 0,
        typeaheadQuery: "",
      })
      expect(res.action.kind).toBe("toggle")
    }

    // Focus leaf (image:1) -> activate
    {
      const idx = rows.findIndex((r) => r.item.id === "image:1")
      const res = __private__.nextActionFromKey({
        key: "Enter",
        rows,
        focusedIndex: idx,
        typeaheadQuery: "",
      })
      expect(res.action).toEqual({ kind: "activate", id: "image:1" })
    }
  })

  it("Space selects focused item (no expand/collapse)", () => {
    const items = sampleItems()
    const expanded = __private__.toExpandedSet(["artboard"])
    const rows = __private__.flattenVisibleTree(items, expanded)
    const idx = rows.findIndex((r) => r.item.id === "image:1")

    const res = __private__.nextActionFromKey({
      key: " ",
      rows,
      focusedIndex: idx,
      typeaheadQuery: "",
    })

    expect(res.action).toEqual({ kind: "select", id: "image:1" })
  })

  it("* expands siblings at the same level", () => {
    const items = sampleItems()
    // Expand artboard so both image siblings are visible, but keep image:2 collapsed
    const expanded = __private__.toExpandedSet(["artboard"])
    const rows = __private__.flattenVisibleTree(items, expanded)
    const idxImage1 = rows.findIndex((r) => r.item.id === "image:1")

    const res = __private__.nextActionFromKey({
      key: "*",
      rows,
      focusedIndex: idxImage1,
      typeaheadQuery: "",
    })

    // Only image:2 qualifies (has children and is collapsed) at the same level.
    expect(res.action).toEqual({ kind: "expandSiblings", ids: ["image:2"] })
  })

  it("typeahead focuses the next prefix match (wraparound)", () => {
    const items = sampleItems()
    const expanded = __private__.toExpandedSet(["artboard"])
    const rows = __private__.flattenVisibleTree(items, expanded)

    // Focus "settings" (last visible row)
    const focusedIndex = rows.findIndex((r) => r.item.id === "settings")
    const res = __private__.nextActionFromKey({
      key: "I",
      rows,
      focusedIndex,
      typeaheadQuery: "",
    })

    expect(res.action.kind).toBe("focusIndex")
    // Next item starting with "i" should be "Image A" (wraparound).
    const idx = (res.action as { kind: "focusIndex"; index: number }).index
    expect(rows[idx]!.item.id).toBe("image:1")
  })
})

