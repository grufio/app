"use client"

/**
 * Left panel for the project editor (layers/navigation).
 *
 * Responsibilities:
 * - Render the project sidebar and selection.
 * - Provide a resizable panel width via pointer drag (desktop only).
 * - On mobile (`< md`) render as a Radix Sheet drawer instead of a
 *   static sidebar, gated by a toggle in the app-bar.
 */
import * as React from "react"
import { SidebarFrame } from "@/components/navigation/SidebarFrame"
import { SidebarContent } from "@/components/ui/sidebar"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { EditorSidebarSection } from "./sidebar/editor-sidebar-section"
import { EditorNavTree, type EditorNavMasterImage } from "./editor-nav-tree"
import { TabsSidepanel, type SidepanelTab } from "./TabsSidepanel"
import { useResizableSidebar } from "./use-resizable-sidebar"
import type { UploadedMasterSnapshot } from "@/lib/editor/upload-master-image"

export const ProjectEditorLeftPanel = React.memo(function ProjectEditorLeftPanel(props: {
  projectId: string
  widthRem: number
  minRem: number
  maxRem: number
  onWidthRemChange: (next: number) => void
  selectedId: string
  onSelect: (id: string) => void
  /** The project's master image. The nav-tree's image entry mirrors
   * this exactly — null when no master has been uploaded yet. */
  masterImage: EditorNavMasterImage | null
  hasGrid: boolean
  onImageUploaded: (master: UploadedMasterSnapshot | null) => void | Promise<void>
  onImageDeleteRequested: (imageId: string) => void | Promise<void>
  onGridCreateRequested: () => void | Promise<void>
  onGridDeleteRequested: () => void | Promise<void>
  activeTab: SidepanelTab
  onActiveTabChange: (tab: SidepanelTab) => void
  filterPanelContent?: React.ReactNode
  tracePanelContent?: React.ReactNode
  /** Mobile-only drawer state. Ignored on `md+` where the panel is
   * always rendered as a static sidebar. */
  open?: boolean
  /** Mobile-only drawer onOpenChange. Triggered by Sheet's built-in
   * close (Escape, overlay click). Ignored on `md+`. */
  onOpenChange?: (open: boolean) => void
}) {
  const {
    projectId,
    widthRem,
    minRem,
    maxRem,
    onWidthRemChange,
    selectedId,
    onSelect,
    masterImage,
    hasGrid,
    onImageUploaded,
    onImageDeleteRequested,
    onGridCreateRequested,
    onGridDeleteRequested,
    activeTab,
    onActiveTabChange,
    filterPanelContent,
    tracePanelContent,
    open = true,
    onOpenChange,
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

  const panelBody = (
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
              masterImage={masterImage}
              hasGrid={hasGrid}
              onImageUploaded={onImageUploaded}
              onImageDeleteRequested={onImageDeleteRequested}
              onGridCreateRequested={onGridCreateRequested}
              onGridDeleteRequested={onGridDeleteRequested}
            />
          </EditorSidebarSection>
        )}
      </SidebarContent>
    </SidebarFrame>
  )

  return (
    <>
      {/* Desktop sidebar — hidden on mobile via CSS, no flash during
       * hydration. */}
      <aside
        id="left-panel"
        className="relative hidden shrink-0 border-r bg-white md:block"
        aria-label="Layers"
        style={{ width: `${clamp(widthRem)}rem` }}
      >
        {panelBody}
        {/* Resize handle (use border line; no separate visual handle). */}
        <div
          aria-hidden="true"
          className="absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize"
          onMouseDown={onResizeMouseDown}
        />
      </aside>

      {/* Mobile drawer — Radix Sheet, portal-mounted. Body content
       * is only rendered to the DOM while `open` is true. */}
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="left" className="w-full bg-white p-0 sm:max-w-md">
          <SheetTitle className="sr-only">Layers</SheetTitle>
          {panelBody}
        </SheetContent>
      </Sheet>
    </>
  )
})

ProjectEditorLeftPanel.displayName = "ProjectEditorLeftPanel"

