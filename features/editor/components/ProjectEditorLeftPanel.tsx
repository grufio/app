"use client"

/**
 * Left panel for the project editor (layers/navigation).
 *
 * Responsibilities:
 * - Render the project sidebar and selection.
 * - Provide a resizable panel width via pointer drag.
 */
import * as React from "react"

import { ProjectSidebar } from "@/components/navigation/ProjectSidebar"
import { SidebarFrame } from "@/components/navigation/SidebarFrame"

export const ProjectEditorLeftPanel = React.memo(function ProjectEditorLeftPanel(props: {
  widthRem: number
  minRem: number
  maxRem: number
  onWidthRemChange: (next: number) => void
  selectedId: string
  onSelect: (id: string) => void
}) {
  const { widthRem, minRem, maxRem, onWidthRemChange, selectedId, onSelect } = props

  const clamp = (v: number) => Math.max(minRem, Math.min(maxRem, v))

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
        <ProjectSidebar selectedId={selectedId} onSelect={onSelect} />
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

