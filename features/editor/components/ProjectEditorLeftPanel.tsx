"use client"

/**
 * Left panel for the project editor (layers/navigation).
 *
 * Responsibilities:
 * - Render the project sidebar and selection.
 * - Provide a resizable panel width via pointer drag.
 */
import * as React from "react"
import { RichTreeView } from "@mui/x-tree-view/RichTreeView"
import { TreeItem, type TreeItemProps } from "@mui/x-tree-view/TreeItem"
import { Image as ImageIcon, LayoutGrid } from "lucide-react"
import Stack from "@mui/material/Stack"

import { SidebarFrame } from "@/components/navigation/SidebarFrame"
import { SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from "@/components/ui/sidebar"

function ArtboardTypeIcon() {
  return <LayoutGrid aria-hidden="true" size={16} strokeWidth={1} />
}

function ImageTypeIcon() {
  return <ImageIcon aria-hidden="true" size={16} strokeWidth={1} />
}

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

  const items = React.useMemo(() => {
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

  const iconKeyById = React.useMemo(() => {
    const m = new Map<string, "artboard" | "image">()
    m.set("app", "artboard")
    m.set("app/api", "image")
    return m
  }, [])

  const ItemWithIcons = React.useMemo(() => {
    function Item(props: TreeItemProps) {
      const iconKey = iconKeyById.get(props.itemId)
      const typeIcon =
        iconKey === "artboard" ? (
          <ArtboardTypeIcon />
        ) : iconKey === "image" ? (
          <ImageTypeIcon />
        ) : null

      // MUI demo pattern: keep caret icons (expand/collapse) and render the type icon as a separate
      // element next to the label in the content layout (do NOT use `slots.icon`).
      const label =
        typeIcon == null ? (
          props.label
        ) : (
          <Stack direction="row" spacing={1} alignItems="center">
            {typeIcon}
            <div>{props.label}</div>
          </Stack>
        )

      return <TreeItem {...props} label={label} />
    }

    return Item
  }, [iconKeyById])

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
                <RichTreeView
                  items={items}
                  aria-label="Layers"
                  expandedItems={expandedIds}
                  selectedItems={selectedId}
                  expansionTrigger="iconContainer"
                  slots={{ item: ItemWithIcons }}
                  onSelectedItemsChange={(_event, itemIds) => {
                    if (typeof itemIds !== "string") return
                    onSelect(itemIds)
                  }}
                  onItemExpansionToggle={(_event, itemId, isExpanded) => {
                    onToggleExpanded(String(itemId), Boolean(isExpanded))
                  }}
                />
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

