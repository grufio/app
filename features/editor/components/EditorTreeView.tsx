"use client"

/**
 * EditorTreeView
 *
 * A standalone, accessible TreeView component built from scratch.
 *
 * Constraints:
 * - Do NOT import or render any shadcn sidebar primitives (`Sidebar*`, `SidebarMenu*`, `Collapsible*`).
 * - Do NOT copy Tailwind class strings; use minimal inline styles only.
 *
 * Pointer interactions (Figma-like):
 * - Caret/twistie is a separate hit target that ONLY expands/collapses.
 * - Row click selects/activates ONLY (does not expand/collapse).
 *
 * Keyboard interactions (MUI-equivalent):
 * - Matches MUI TreeView accessibility table 1:1 where applicable:
 *   https://mui.com/x/react-tree-view/accessibility/
 *
 * ARIA baseline:
 * - WAI-ARIA TreeView pattern:
 *   https://www.w3.org/WAI/ARIA/apg/patterns/treeview/
 */

import * as React from "react"
import { ChevronDown, ChevronRight } from "lucide-react"

export type EditorTreeItem = {
  id: string
  label: string
  href?: string
  iconKey?: string
  children?: EditorTreeItem[]
  disabled?: boolean
}

export type EditorTreeViewProps = {
  items: EditorTreeItem[]
  selectedId: string | null
  expandedIds: string[]
  onSelect: (id: string) => void
  onToggleExpanded: (id: string, nextExpanded: boolean) => void
  /**
   * Optional “open/activate” callback (e.g. follow link, open editor tab).
   * - Pointer: can be invoked by the consumer on double click if desired.
   * - Keyboard: invoked on Enter for leaf nodes only (parents use Enter to toggle expand/collapse per MUI).
   */
  onActivate?: (item: EditorTreeItem) => void
  renderIcon?: (item: EditorTreeItem) => React.ReactNode
  ariaLabel?: string
}

export type FlatRow = {
  item: EditorTreeItem
  depth: number
  parentId: string | null
  hasChildren: boolean
  isExpanded: boolean
}

export function toExpandedSet(expandedIds: string[]) {
  return new Set(expandedIds)
}

export function flattenVisibleTree(items: EditorTreeItem[], expanded: Set<string>): FlatRow[] {
  const out: FlatRow[] = []

  const walk = (node: EditorTreeItem, depth: number, parentId: string | null) => {
    const children = node.children ?? []
    const hasChildren = children.length > 0
    const isExpanded = hasChildren ? expanded.has(node.id) : false
    out.push({ item: node, depth, parentId, hasChildren, isExpanded })
    if (!hasChildren || !isExpanded) return
    for (const child of children) walk(child, depth + 1, node.id)
  }

  for (const root of items) walk(root, 0, null)
  return out
}

export function normalizeKeyToChar(key: string) {
  // Single printable character (basic typeahead).
  if (key.length !== 1) return null
  if (key === " " || key === "\t" || key === "\n") return null
  // In a treeview, '*' is a dedicated command (expand siblings), not typeahead input.
  if (key === "*") return null
  return key
}

export function startsWithIgnoreCase(haystack: string, needle: string) {
  return haystack.toLocaleLowerCase().startsWith(needle.toLocaleLowerCase())
}

export function expandSiblingsAtLevel(rows: FlatRow[], focusedIndex: number): string[] {
  const focused = rows[focusedIndex]
  if (!focused) return []
  const { depth, parentId } = focused
  const ids: string[] = []
  for (const r of rows) {
    if (r.depth !== depth) continue
    if (r.parentId !== parentId) continue
    if (!r.hasChildren) continue
    if (r.isExpanded) continue
    ids.push(r.item.id)
  }
  return ids
}

export type NextAction =
  | { kind: "none" }
  | { kind: "focusIndex"; index: number }
  | { kind: "toggle"; id: string; nextExpanded: boolean }
  | { kind: "select"; id: string }
  | { kind: "activate"; id: string }
  | { kind: "expandSiblings"; ids: string[] }

export function nextActionFromKey(opts: {
  key: string
  rows: FlatRow[]
  focusedIndex: number
  // For Typeahead
  typeaheadQuery: string
}): { preventDefault: boolean; nextTypeaheadQuery: string; action: NextAction } {
  const { key, rows, focusedIndex, typeaheadQuery } = opts

  if (!rows.length) return { preventDefault: false, nextTypeaheadQuery: "", action: { kind: "none" } }
  const curIdx = focusedIndex >= 0 ? focusedIndex : 0
  const cur = rows[curIdx]!

  // MUI: '*' expands all siblings at same level (must not be treated as typeahead)
  if (key === "*") {
    const ids = expandSiblingsAtLevel(rows, curIdx)
    return { preventDefault: true, nextTypeaheadQuery: "", action: { kind: "expandSiblings", ids } }
  }

  // Typeahead
  const ch = normalizeKeyToChar(key)
  if (ch) {
    const nextQ = `${typeaheadQuery}${ch}`
    const start = curIdx + 1
    const n = rows.length
    for (let i = 0; i < n; i++) {
      const idx = (start + i) % n
      if (startsWithIgnoreCase(rows[idx]!.item.label, nextQ)) {
        return { preventDefault: true, nextTypeaheadQuery: nextQ, action: { kind: "focusIndex", index: idx } }
      }
    }
    return { preventDefault: true, nextTypeaheadQuery: nextQ, action: { kind: "none" } }
  }

  // Navigation
  if (key === "ArrowDown") {
    return { preventDefault: true, nextTypeaheadQuery: "", action: { kind: "focusIndex", index: Math.min(rows.length - 1, curIdx + 1) } }
  }
  if (key === "ArrowUp") {
    return { preventDefault: true, nextTypeaheadQuery: "", action: { kind: "focusIndex", index: Math.max(0, curIdx - 1) } }
  }
  if (key === "Home") {
    return { preventDefault: true, nextTypeaheadQuery: "", action: { kind: "focusIndex", index: 0 } }
  }
  if (key === "End") {
    return { preventDefault: true, nextTypeaheadQuery: "", action: { kind: "focusIndex", index: rows.length - 1 } }
  }
  if (key === "ArrowRight") {
    // - collapsed parent -> expand (focus stays)
    // - expanded parent -> focus first child
    if (cur.hasChildren && !cur.isExpanded) {
      return { preventDefault: true, nextTypeaheadQuery: "", action: { kind: "toggle", id: cur.item.id, nextExpanded: true } }
    }
    if (cur.hasChildren && cur.isExpanded) {
      return { preventDefault: true, nextTypeaheadQuery: "", action: { kind: "focusIndex", index: Math.min(rows.length - 1, curIdx + 1) } }
    }
    return { preventDefault: true, nextTypeaheadQuery: "", action: { kind: "none" } }
  }
  if (key === "ArrowLeft") {
    // - expanded parent -> collapse (focus stays)
    // - otherwise -> focus parent if exists
    if (cur.hasChildren && cur.isExpanded) {
      return { preventDefault: true, nextTypeaheadQuery: "", action: { kind: "toggle", id: cur.item.id, nextExpanded: false } }
    }
    if (cur.parentId) {
      const parentIdx = rows.findIndex((r) => r.item.id === cur.parentId)
      if (parentIdx >= 0) {
        return { preventDefault: true, nextTypeaheadQuery: "", action: { kind: "focusIndex", index: parentIdx } }
      }
    }
    return { preventDefault: true, nextTypeaheadQuery: "", action: { kind: "none" } }
  }

  // Selection vs activation (MUI)
  if (key === " ") {
    return { preventDefault: true, nextTypeaheadQuery: "", action: { kind: "select", id: cur.item.id } }
  }
  if (key === "Enter") {
    if (cur.hasChildren) {
      return { preventDefault: true, nextTypeaheadQuery: "", action: { kind: "toggle", id: cur.item.id, nextExpanded: !cur.isExpanded } }
    }
    return { preventDefault: true, nextTypeaheadQuery: "", action: { kind: "activate", id: cur.item.id } }
  }

  return { preventDefault: false, nextTypeaheadQuery: "", action: { kind: "none" } }
}

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = el.tagName?.toUpperCase()
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"
}

export function EditorTreeView(props: EditorTreeViewProps) {
  const {
    items,
    selectedId,
    expandedIds,
    onSelect,
    onToggleExpanded,
    onActivate,
    renderIcon,
    ariaLabel = "Tree",
  } = props

  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const expanded = React.useMemo(() => toExpandedSet(expandedIds), [expandedIds])
  const rows = React.useMemo(() => flattenVisibleTree(items, expanded), [items, expanded])

  const indexById = React.useMemo(() => {
    const m = new Map<string, number>()
    rows.forEach((r, idx) => m.set(r.item.id, idx))
    return m
  }, [rows])

  const [focusedId, setFocusedId] = React.useState<string | null>(() => selectedId ?? rows[0]?.item.id ?? null)

  const isTreeFocused = React.useCallback(() => {
    const root = rootRef.current
    if (!root) return false
    const active = document.activeElement
    return Boolean(active && root.contains(active))
  }, [])

  // Keep focusedId aligned with selection changes, but do not steal focus.
  React.useEffect(() => {
    if (!selectedId) return
    if (!indexById.has(selectedId)) return
    setFocusedId(selectedId)
    // Only focus if the tree already contains focus.
    if (isTreeFocused()) {
      queueMicrotask(() => {
        const el = itemRefs.current.get(selectedId)
        el?.focus()
      })
    }
  }, [indexById, isTreeFocused, selectedId])

  // Ensure focusedId is always visible.
  React.useEffect(() => {
    if (!rows.length) {
      setFocusedId(null)
      return
    }
    if (focusedId && indexById.has(focusedId)) return
    const next = selectedId && indexById.has(selectedId) ? selectedId : rows[0]!.item.id
    setFocusedId(next)
  }, [focusedId, indexById, rows, selectedId])

  const focusedIndex = React.useMemo(() => {
    if (!focusedId) return -1
    return indexById.get(focusedId) ?? -1
  }, [focusedId, indexById])

  const itemRefs = React.useRef<Map<string, HTMLDivElement>>(new Map())
  const setItemRef = React.useCallback((id: string) => {
    return (el: HTMLDivElement | null) => {
      if (!el) return
      itemRefs.current.set(id, el)
    }
  }, [])

  const focusByIndex = (idx: number) => {
    const r = rows[idx]
    if (!r) return
    setFocusedId(r.item.id)
    queueMicrotask(() => itemRefs.current.get(r.item.id)?.focus())
  }

  // Typeahead buffer
  const typeaheadRef = React.useRef<{ q: string; t: number | null }>({ q: "", t: null })
  const resetTypeahead = () => {
    const cur = typeaheadRef.current
    if (cur.t != null) window.clearTimeout(cur.t)
    typeaheadRef.current = { q: "", t: null }
  }
  const bumpTypeaheadTimeout = () => {
    const cur = typeaheadRef.current
    if (cur.t != null) window.clearTimeout(cur.t)
    cur.t = window.setTimeout(() => {
      typeaheadRef.current = { q: "", t: null }
    }, 600)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.defaultPrevented) return
    if (isTypingTarget(e.target)) return

    const res = nextActionFromKey({
      key: e.key,
      rows,
      focusedIndex,
      typeaheadQuery: typeaheadRef.current.q,
    })

    if (!res.preventDefault) return
    e.preventDefault()
    e.stopPropagation()

    typeaheadRef.current.q = res.nextTypeaheadQuery
    if (res.nextTypeaheadQuery) bumpTypeaheadTimeout()
    else resetTypeahead()

    const action = res.action
    if (action.kind === "focusIndex") {
      focusByIndex(action.index)
      return
    }
    if (action.kind === "toggle") {
      const row = rows[indexById.get(action.id) ?? -1]
      if (row?.item.disabled) return
      onToggleExpanded(action.id, action.nextExpanded)
      return
    }
    if (action.kind === "select") {
      const row = rows[indexById.get(action.id) ?? -1]
      if (row?.item.disabled) return
      onSelect(action.id)
      return
    }
    if (action.kind === "activate") {
      const idx = indexById.get(action.id)
      const row = typeof idx === "number" ? rows[idx] : undefined
      if (!row || row.item.disabled) return
      if (onActivate) onActivate(row.item)
      else onSelect(row.item.id)
      return
    }
    if (action.kind === "expandSiblings") {
      for (const id of action.ids) onToggleExpanded(id, true)
      return
    }
  }

  const onRootFocusCapture = (e: React.FocusEvent) => {
    const root = rootRef.current
    if (!root) return
    const related = e.relatedTarget as Node | null
    // Focus entered the tree from outside: focus the selected item (if visible) or the first visible item.
    if (related && root.contains(related)) return
    const initialId =
      (selectedId && indexById.has(selectedId) && selectedId) ||
      (focusedId && indexById.has(focusedId) && focusedId) ||
      rows[0]?.item.id ||
      null
    if (!initialId) return
    setFocusedId(initialId)
    queueMicrotask(() => itemRefs.current.get(initialId)?.focus())
  }

  const rowBaseStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    paddingBlock: 6,
    paddingInlineEnd: 8,
    borderRadius: 8,
    userSelect: "none",
  }

  const caretStyle: React.CSSProperties = {
    width: 24,
    height: 24,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    background: "transparent",
    border: 0,
    padding: 0,
    flex: "0 0 auto",
  }

  const renderNode = (item: EditorTreeItem, depth: number, parentId: string | null) => {
    const children = item.children ?? []
    const hasChildren = children.length > 0
    const isExpanded = hasChildren ? expanded.has(item.id) : false
    const active = selectedId === item.id
    const focused = focusedId === item.id

    const indentStyle: React.CSSProperties = {
      paddingInlineStart: 8 + depth * 16,
    }

    return (
      <div key={item.id} role="none">
        <div
          ref={setItemRef(item.id)}
          role="treeitem"
          aria-selected={active || undefined}
          aria-level={depth + 1}
          aria-expanded={hasChildren ? isExpanded : undefined}
          aria-disabled={item.disabled || undefined}
          tabIndex={focused ? 0 : -1}
          onFocus={() => setFocusedId(item.id)}
          onClick={() => {
            if (item.disabled) return
            onSelect(item.id)
          }}
          style={{
            ...indentStyle,
            ...rowBaseStyle,
            background: active ? "rgba(0,0,0,0.06)" : "transparent",
            outline: "none",
            cursor: item.disabled ? "default" : "pointer",
            opacity: item.disabled ? 0.5 : 1,
          }}
          data-editor-tree-id={item.id}
          data-editor-tree-parent-id={parentId ?? ""}
        >
          {hasChildren ? (
            <button
              type="button"
              aria-label={isExpanded ? "Collapse" : "Expand"}
              onMouseDown={(ev) => {
                // Keep focus on the treeitem (caret is pointer-only).
                ev.preventDefault()
              }}
              onClick={(ev) => {
                ev.preventDefault()
                ev.stopPropagation()
                if (item.disabled) return
                onToggleExpanded(item.id, !isExpanded)
              }}
              style={caretStyle}
              tabIndex={-1}
            >
              {isExpanded ? <ChevronDown aria-hidden="true" size={16} /> : <ChevronRight aria-hidden="true" size={16} />}
            </button>
          ) : (
            <span style={{ width: 24, height: 24, display: "inline-block", flex: "0 0 auto" }} aria-hidden="true" />
          )}

          {renderIcon ? renderIcon(item) : null}
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.label}
          </span>
        </div>

        {hasChildren && isExpanded ? (
          <div role="group" aria-label={`${item.label} children`}>
            {children.map((c) => renderNode(c, depth + 1, item.id))}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div
      ref={rootRef}
      role="tree"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      onFocusCapture={onRootFocusCapture}
    >
      {items.map((i) => renderNode(i, 0, null))}
    </div>
  )
}

export const __private__ = {
  expandSiblingsAtLevel,
  flattenVisibleTree,
  nextActionFromKey,
  normalizeKeyToChar,
  startsWithIgnoreCase,
  toExpandedSet,
}

