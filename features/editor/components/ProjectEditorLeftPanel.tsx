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
import { EditorSidebarSection } from "./sidebar/editor-sidebar-section"
import { EditorNavTree } from "./editor-nav-tree"
import { TabsSidepanel, type SidepanelTab } from "./TabsSidepanel"
import { useResizableSidebar } from "./use-resizable-sidebar"

export const ProjectEditorLeftPanel = React.memo(function ProjectEditorLeftPanel(props: {
  projectId: string
  widthRem: number
  minRem: number
  maxRem: number
  onWidthRemChange: (next: number) => void
  selectedId: string
  onSelect: (id: string) => void
  images: { id: string; label: string }[]
  hasGrid: boolean
  onImageUploaded: () => void | Promise<void>
  onImageDeleteRequested: (imageId: string) => void | Promise<void>
  canDeleteActiveImage: boolean
  deleteTargetImageId: string | null
  onGridCreateRequested: () => void | Promise<void>
  onGridDeleteRequested: () => void | Promise<void>
  activeTab: SidepanelTab
  onActiveTabChange: (tab: SidepanelTab) => void
  filterPanelContent?: React.ReactNode
  tracePanelContent?: React.ReactNode
}) {
  const {
    projectId,
    widthRem,
    minRem,
    maxRem,
    onWidthRemChange,
    selectedId,
    onSelect,
    images,
    hasGrid,
    onImageUploaded,
    onImageDeleteRequested,
    canDeleteActiveImage,
    deleteTargetImageId,
    onGridCreateRequested,
    onGridDeleteRequested,
    activeTab,
    onActiveTabChange,
    filterPanelContent,
    tracePanelContent,
  } = props

  const clamp = (v: number) => Math.max(minRem, Math.min(maxRem, v))
  const startResize = useResizableSidebar()

  const onResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    startResize({
      startClientX: e.clientX,
      startWidthRem: widthRem,
      minRem,
      maxRem,
      direction: "expand-right",
      onWidthRemChange,
    })
  }

  return (
    <aside
      className="shrink-0 border-r bg-white relative"
      aria-label="Layers"
      style={{ width: `${clamp(widthRem)}rem` }}
    >
      <SidebarFrame className="block min-h-0 w-full">
        <SidebarContent className="gap-0">
          <TabsSidepanel activeTab={activeTab} onTabChange={onActiveTabChange} />
          {activeTab === "filter" ? (
            filterPanelContent
          ) : activeTab === "trace" ? (
            tracePanelContent
          ) : (
            <EditorSidebarSection title="Projekt">
              <EditorNavTree
                projectId={projectId}
                selectedId={selectedId}
                onSelect={onSelect}
                images={images}
                hasGrid={hasGrid}
                onImageUploaded={onImageUploaded}
                onImageDeleteRequested={onImageDeleteRequested}
                canDeleteActiveImage={canDeleteActiveImage}
                deleteTargetImageId={deleteTargetImageId}
                onGridCreateRequested={onGridCreateRequested}
                onGridDeleteRequested={onGridDeleteRequested}
              />
            </EditorSidebarSection>
          )}
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

