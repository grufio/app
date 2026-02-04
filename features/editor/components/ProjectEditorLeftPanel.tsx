"use client"

/**
 * Left panel for the project editor (layers/navigation).
 *
 * Responsibilities:
 * - Render the project sidebar and selection.
 * - Provide a resizable panel width via pointer drag.
 */
import * as React from "react"
import { Image as ImageIcon, LayoutGrid } from "lucide-react"

import { SidebarFrame } from "@/components/navigation/SidebarFrame"
import { SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from "@/components/ui/sidebar"
import { EditorTreeView, type EditorTreeItem } from "@/features/editor/components/EditorTreeView"

export const ProjectEditorLeftPanel = React.memo(function ProjectEditorLeftPanel(props: {
  widthRem: number
  minRem: number
  maxRem: number
  onWidthRemChange: (next: number) => void
  selectedId: string
  onSelect: (id: string) => void
}) {
  const { widthRem, minRem, maxRem, onWidthRemChange, selectedId, onSelect } = props

  const [expandedIds, setExpandedIds] = React.useState<string[]>(() => ["app"])

  const onToggleExpanded = React.useCallback((id: string, nextExpanded: boolean) => {
    setExpandedIds((prev) => {
      const has = prev.includes(id)
      if (nextExpanded && has) return prev
      if (!nextExpanded && !has) return prev
      return nextExpanded ? [...prev, id] : prev.filter((x) => x !== id)
    })
  }, [])

  const clamp = (v: number) => Math.max(minRem, Math.min(maxRem, v))

  const items = React.useMemo<EditorTreeItem[]>(() => {
    // MVP placeholder data wired to the existing right-panel routing rule:
    // `services/editor/panel-routing.ts` treats `selectedId.startsWith("app/api")` as the image panel.
    return [
      {
        id: "app",
        label: "Artboard",
        children: [
          {
            id: "app/api",
            label: "Image",
          },
        ],
      },
    ]
  }, [])

  const onResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const prevCursor = document.body.style.cursor
    const prevUserSelect = document.body.style.userSelect
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    const startX = e.clientX
    const startWidthPx = widthRem * 16

    const onMove = (ev: MouseEvent) => {
      const nextWidthPx = startWidthPx + (ev.clientX - startX)
      const nextRem = clamp(nextWidthPx / 16)
      onWidthRemChange(nextRem)
    }

    const onUp = () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevUserSelect
    }

    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }

  return (
    <aside
      className="shrink-0 border-r bg-white relative"
      aria-label="Layers"
      style={{ width: `${clamp(widthRem)}rem` }}
    >
      <SidebarFrame className="block min-h-0 w-full">
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Layers</SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="editor-treeview-adapter">
                <EditorTreeView
                  items={items}
                  selectedId={selectedId}
                  expandedIds={expandedIds}
                  onSelect={onSelect}
                  onToggleExpanded={onToggleExpanded}
                  ariaLabel="Layers"
                  renderIcon={(item) => {
                    if (item.id === "app") return <LayoutGrid aria-hidden="true" size={16} strokeWidth={1} />
                    if (item.id === "app/api") return <ImageIcon aria-hidden="true" size={16} strokeWidth={1} />
                    return null
                  }}
                />
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </SidebarFrame>
      {/* Resize handle (use border line; no separate visual handle). */}
      <div
        aria-hidden="true"
        className="absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize"
        onMouseDown={onResizeMouseDown}
      />
    </aside>
  )
})

ProjectEditorLeftPanel.displayName = "ProjectEditorLeftPanel"

