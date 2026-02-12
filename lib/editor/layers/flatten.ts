/**
 * Layers tree flattening (UI-agnostic).
 *
 * Responsibilities:
 * - Convert a nested `LayerNode` tree into a flat list with depth/expanded metadata.
 */
import type { LayerNode } from "@/lib/editor/layers-tree"

export type FlatLayerRow = {
  node: LayerNode
  depth: number
  hasChildren: boolean
  isExpanded: boolean
}

export function flattenLayerTree(root: LayerNode, expanded: Set<string>): FlatLayerRow[] {
  const rows: FlatLayerRow[] = []
  const walk = (n: LayerNode, depth: number) => {
    const children = n.children ?? []
    const hasChildren = children.length > 0
    const isExpanded = hasChildren ? expanded.has(n.id) : false
    rows.push({ node: n, depth, hasChildren, isExpanded })
    if (!hasChildren || !isExpanded) return
    for (const c of children) walk(c, depth + 1)
  }
  walk(root, 0)
  return rows
}

