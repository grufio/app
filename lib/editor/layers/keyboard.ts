/**
 * Layers keyboard navigation (UI-agnostic).
 *
 * Responsibilities:
 * - Decide how selection/expanded state should change for key presses.
 * - Keep React event handling in the UI; this module is pure decision logic.
 */
import type { FlatLayerRow } from "./flatten"

export type LayerTreeKeyResult = {
  preventDefault: boolean
  nextSelectedIndex?: number
  selectId?: string
  toggleExpandId?: string
  setExpandedId?: { id: string; expanded: boolean }
}

export function nextLayerTreeStateFromKey(opts: {
  key: string
  selectedIndex: number
  rows: FlatLayerRow[]
}): LayerTreeKeyResult {
  const { key, rows } = opts
  const selectedIndex = Math.max(0, opts.selectedIndex)

  if (key === "ArrowDown") {
    const next = Math.min(rows.length - 1, selectedIndex + 1)
    const r = rows[next]
    return { preventDefault: true, nextSelectedIndex: next, selectId: r?.node.id }
  }
  if (key === "ArrowUp") {
    const next = Math.max(0, selectedIndex - 1)
    const r = rows[next]
    return { preventDefault: true, nextSelectedIndex: next, selectId: r?.node.id }
  }
  if (key === "ArrowRight") {
    const r = rows[selectedIndex]
    if (!r?.hasChildren) return { preventDefault: false }
    return { preventDefault: true, setExpandedId: { id: r.node.id, expanded: true } }
  }
  if (key === "ArrowLeft") {
    const r = rows[selectedIndex]
    if (!r?.hasChildren) return { preventDefault: false }
    return { preventDefault: true, setExpandedId: { id: r.node.id, expanded: false } }
  }
  if (key === "Enter") {
    const r = rows[selectedIndex]
    return { preventDefault: true, selectId: r?.node.id }
  }
  if (key === " ") {
    const r = rows[selectedIndex]
    if (!r?.hasChildren) return { preventDefault: false }
    return { preventDefault: true, toggleExpandId: r.node.id }
  }
  return { preventDefault: false }
}

