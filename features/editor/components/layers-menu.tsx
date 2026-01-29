"use client"

/**
 * Layers menu (editor).
 *
 * Responsibilities:
 * - Render a selectable, expandable layer tree.
 * - Track expanded state locally and report selection to callers.
 */
import { ChevronDown, ChevronRight, Image as ImageIcon, LayoutGrid, SlidersHorizontal } from "lucide-react"
import { useCallback, useMemo, useRef, useState } from "react"

import type { LayerNode, LayerKind } from "@/lib/editor/layers-tree"
import { cn } from "@/lib/utils"
import { flattenLayerTree, type FlatLayerRow } from "@/lib/editor/layers/flatten"
import { nextLayerTreeStateFromKey } from "@/lib/editor/layers/keyboard"

type Props = {
  root: LayerNode
  selectedId: string
  onSelect: (node: { id: string; kind: LayerKind; parentId?: string }) => void
  className?: string
}

function iconFor(kind: LayerKind) {
  if (kind === "artboard") return LayoutGrid
  if (kind === "image") return ImageIcon
  return SlidersHorizontal
}

function isTypingTarget(el: EventTarget | null): boolean {
  const n = el as HTMLElement | null
  if (!n) return false
  const tag = n.tagName?.toLowerCase()
  if (tag === "input" || tag === "textarea" || tag === "select") return true
  return Boolean(n.isContentEditable)
}

export function LayersMenu({ root, selectedId, onSelect, className }: Props) {
  const [expandedState, setExpandedState] = useState<{ rootId: string; expanded: Set<string> }>(() => ({
    rootId: root.id,
    expanded: new Set([root.id]),
  }))
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  const expandedIds = useMemo(
    () => (expandedState.rootId === root.id ? expandedState.expanded : new Set([root.id])),
    [expandedState.expanded, expandedState.rootId, root.id]
  )

  const rows = useMemo(() => flattenLayerTree(root, expandedIds), [expandedIds, root])

  const toggle = useCallback(
    (id: string) => {
      setExpandedState((prev) => {
        const base = prev.rootId === root.id ? prev.expanded : new Set([root.id])
        const next = new Set(base)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        // Always keep root expanded (Figma-like outline root).
        next.add(root.id)
        return { rootId: root.id, expanded: next }
      })
    },
    [root.id]
  )

  const selectedIdx = useMemo(() => rows.findIndex((r) => r.node.id === selectedId), [rows, selectedId])

  const focusByIndex = (idx: number) => {
    const r = rows[idx]
    if (!r) return
    const el = itemRefs.current.get(r.node.id)
    el?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.defaultPrevented) return
    if (isTypingTarget(e.target)) return

    const res = nextLayerTreeStateFromKey({ key: e.key, selectedIndex: selectedIdx, rows: rows as FlatLayerRow[] })
    if (!res.preventDefault) return
    e.preventDefault()

    if (res.selectId) {
      const r = rows.find((x) => x.node.id === res.selectId)
      if (r) onSelect({ id: r.node.id, kind: r.node.kind, parentId: r.node.parentId })
    }
    if (typeof res.nextSelectedIndex === "number") {
      queueMicrotask(() => focusByIndex(res.nextSelectedIndex!))
    }
    if (res.toggleExpandId) {
      toggle(res.toggleExpandId)
    }
    if (res.setExpandedId) {
      setExpandedState((prev) => {
        const base = prev.rootId === root.id ? prev.expanded : new Set([root.id])
        const next = new Set(base)
        if (res.setExpandedId!.expanded) next.add(res.setExpandedId!.id)
        else next.delete(res.setExpandedId!.id)
        next.add(root.id)
        return { rootId: root.id, expanded: next }
      })
    }
  }

  return (
    <div className={cn("flex flex-col gap-1", className)} role="tree" aria-label="Layers" onKeyDown={onKeyDown}>
      {rows.map(({ node, depth, hasChildren, isExpanded }) => {
        const active = node.id === selectedId
        const Icon = iconFor(node.kind)
        const Indent = { paddingLeft: `${8 + depth * 16}px` }
        return (
          <div key={node.id} role="none">
            <button
              ref={(el) => {
                if (!el) return
                itemRefs.current.set(node.id, el)
              }}
              type="button"
              role="treeitem"
              aria-selected={active}
              aria-level={depth + 1}
              aria-expanded={hasChildren ? isExpanded : undefined}
              tabIndex={active ? 0 : -1}
              className={cn(
                "group flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm outline-none",
                "hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50",
                active ? "bg-accent text-accent-foreground" : "text-foreground"
              )}
              style={Indent}
              onClick={() => onSelect({ id: node.id, kind: node.kind, parentId: node.parentId })}
            >
              <span className="flex w-4 items-center justify-center">
                {hasChildren ? (
                  <span
                    className="inline-flex size-4 items-center justify-center rounded-sm hover:bg-muted-foreground/10"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      toggle(node.id)
                    }}
                    aria-hidden="true"
                  >
                    {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  </span>
                ) : null}
              </span>
              <Icon className="size-4 shrink-0 text-muted-foreground group-[aria-selected=true]:text-foreground" />
              <span className="truncate">{node.label}</span>
            </button>
          </div>
        )
      })}
    </div>
  )
}

