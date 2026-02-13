"use client"

/**
 * Left panel for the project editor (layers/navigation).
 *
 * Responsibilities:
 * - Render the project sidebar and selection.
 * - Provide a resizable panel width via pointer drag.
 */
import * as React from "react"
import { SidebarFrame } from "@/components/navigation/SidebarFrame"
import { SidebarContent } from "@/components/ui/sidebar"
import { FileTreeView, type FileNode } from "@/components/FileTreeView"
import { ProjectTitleEditor } from "./project-title-editor"
import { EditorSidebarSection } from "./sidebar/editor-sidebar-section"

export const ProjectEditorLeftPanel = React.memo(function ProjectEditorLeftPanel(props: {
  projectId: string
  initialTitle?: string
  onTitleUpdated?: (nextTitle: string) => void
  widthRem: number
  minRem: number
  maxRem: number
  onWidthRemChange: (next: number) => void
  selectedId: string
  onSelect: (id: string) => void
  images: { id: string; label: string }[]
}) {
  const { projectId, initialTitle, onTitleUpdated, widthRem, minRem, maxRem, onWidthRemChange, selectedId, onSelect, images } = props

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

  const items = React.useMemo<FileNode[]>(() => {
    // MVP placeholder data wired to the existing right-panel routing rule:
    // `services/editor/panel-routing.ts` treats `selectedId.startsWith("app/api")` as the image panel.
    const imageChildren: FileNode[] =
      images.length > 0
        ? [
            {
              id: "app/api",
              label: "Images",
              type: "folder",
              children: images.map((img) => ({
                id: `app/api/${img.id}`,
                label: img.label,
                type: "file",
              })),
            },
          ]
        : []
    return [
      {
        id: "app",
        label: "Artboard",
        type: "folder",
        children: imageChildren,
      },
    ]
  }, [images])

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
        <SidebarContent className="gap-0">
          <EditorSidebarSection title="Title">
            <ProjectTitleEditor projectId={projectId} initialTitle={initialTitle} onTitleUpdated={onTitleUpdated} />
          </EditorSidebarSection>
          <EditorSidebarSection title="Layers">
            <FileTreeView
              data={items}
              expandedIds={expandedIds}
              onExpandedIdsChange={setExpandedIds}
              onSelect={(node) => onSelect(node.id)}
              height="100%"
            />
          </EditorSidebarSection>
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

