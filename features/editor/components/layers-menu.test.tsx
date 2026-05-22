/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { LayerNode } from "@/lib/editor/layers-tree"
import { LayersMenu } from "./layers-menu"

afterEach(cleanup)

const tree: LayerNode = {
  id: "artboard-1",
  kind: "artboard",
  label: "Artboard",
  children: [
    { id: "img-1", kind: "image", label: "Photo", parentId: "artboard-1" },
    { id: "flt-1", kind: "filter", label: "B&W", parentId: "artboard-1" },
  ],
}

describe("LayersMenu", () => {
  it("renders a labelled tree with the root expanded", () => {
    render(<LayersMenu root={tree} selectedId="img-1" onSelect={vi.fn()} />)
    expect(screen.getByRole("tree", { name: "Layers" })).toBeTruthy()
    // Root expanded by default -> all three rows present.
    expect(screen.getByRole("treeitem", { name: /Artboard/ })).toBeTruthy()
    expect(screen.getByRole("treeitem", { name: /Photo/ })).toBeTruthy()
    expect(screen.getByRole("treeitem", { name: /B&W/ })).toBeTruthy()
    expect(screen.getByRole("treeitem", { name: /Artboard/ }).getAttribute("aria-expanded")).toBe("true")
  })

  it("marks the selected node with aria-selected", () => {
    render(<LayersMenu root={tree} selectedId="img-1" onSelect={vi.fn()} />)
    expect(screen.getByRole("treeitem", { name: /Photo/ }).getAttribute("aria-selected")).toBe("true")
    expect(screen.getByRole("treeitem", { name: /B&W/ }).getAttribute("aria-selected")).toBe("false")
  })

  it("reports the clicked node id/kind/parent to onSelect", () => {
    const onSelect = vi.fn()
    render(<LayersMenu root={tree} selectedId="artboard-1" onSelect={onSelect} />)
    fireEvent.click(screen.getByRole("treeitem", { name: /Photo/ }))
    expect(onSelect).toHaveBeenCalledWith({ id: "img-1", kind: "image", parentId: "artboard-1" })
  })

  it("expands and collapses a non-root node via its chevron", () => {
    // The root is pinned open by design (`toggle` always re-adds root.id),
    // so exercise expand/collapse on a nested node whose children start hidden.
    const nested: LayerNode = {
      id: "artboard-1",
      kind: "artboard",
      label: "Artboard",
      children: [
        {
          id: "img-1",
          kind: "image",
          label: "Photo",
          parentId: "artboard-1",
          children: [{ id: "flt-1", kind: "filter", label: "B&W", parentId: "img-1" }],
        },
      ],
    }
    render(<LayersMenu root={nested} selectedId="artboard-1" onSelect={vi.fn()} />)
    // Photo starts collapsed -> its child is not rendered.
    expect(screen.queryByRole("treeitem", { name: /B&W/ })).toBeNull()
    expect(screen.getByRole("treeitem", { name: /Photo/ }).getAttribute("aria-expanded")).toBe("false")

    fireEvent.click(screen.getByRole("treeitem", { name: /Photo/ }).querySelector("span[aria-hidden='true']")!)
    expect(screen.getByRole("treeitem", { name: /B&W/ })).toBeTruthy()

    fireEvent.click(screen.getByRole("treeitem", { name: /Photo/ }).querySelector("span[aria-hidden='true']")!)
    expect(screen.queryByRole("treeitem", { name: /B&W/ })).toBeNull()
  })
})
