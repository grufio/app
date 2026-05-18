"use client"

import * as React from "react"
import { Grid3x3, Image as ImageIcon, LayoutGrid, Plus, Trash2 } from "lucide-react"

import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { AddImageMenuAction } from "./add-image-menu-button"
import { LockNavTreeActions, type MenuActionResult } from "./lock-nav-tree-actions"
import { buildNavId, parseNavId } from "@/features/editor/navigation/nav-id"
import { reportClientError } from "@/lib/monitoring/with-error-reporting"

export type EditorNavMasterImage = {
  id: string
  label: string
}

export function EditorNavTree(props: {
  projectId: string
  selectedId: string
  onSelect: (id: string) => void
  /** The project's master image. The nav-tree's image entry represents
   * exactly this row — derivatives (working_copy, filter_working_copy,
   * trace outputs) are implementation details and never surface here. */
  masterImage: EditorNavMasterImage | null
  hasGrid: boolean
  onImageUploaded: () => void | Promise<void>
  onImageDeleteRequested: (imageId: string) => void | Promise<void>
  onGridCreateRequested: () => void | Promise<void>
  onGridDeleteRequested: () => void | Promise<void>
}) {
  const {
    projectId,
    selectedId,
    onSelect,
    masterImage,
    hasGrid,
    onImageUploaded,
    onImageDeleteRequested,
    onGridCreateRequested,
    onGridDeleteRequested,
  } = props

  const artboardNavId = React.useMemo(() => buildNavId({ kind: "artboard" }), [])
  const gridNavId = React.useMemo(() => buildNavId({ kind: "grid" }), [])
  const imageNavId = React.useMemo(
    () => (masterImage ? buildNavId({ kind: "image", imageId: masterImage.id }) : null),
    [masterImage],
  )
  const selectedKind = React.useMemo(() => parseNavId(selectedId).kind, [selectedId])
  const [actionError, setActionError] = React.useState("")
  const handleDeleteImage = React.useCallback(
    async (imageId: string): Promise<MenuActionResult> => {
      try {
        await onImageDeleteRequested(imageId)
        setActionError("")
        return { ok: true }
      } catch (e) {
        reportClientError(e, {
          scope: "editor",
          code: "NAV_TREE_DELETE_FAILED",
          stage: "delete",
          context: { imageId },
        })
        return { ok: false, reason: e instanceof Error ? e.message : "Delete failed" }
      }
    },
    [onImageDeleteRequested],
  )

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton isActive={selectedKind === "artboard"} className="text-xs" onClick={() => onSelect(artboardNavId)}>
          <LayoutGrid />
          <span>Artboard</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      {imageNavId && masterImage ? (
        <>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={selectedKind === "image"}
              className="text-xs"
              onClick={() => onSelect(imageNavId)}
            >
              <ImageIcon />
              <span>Image</span>
            </SidebarMenuButton>
            <LockNavTreeActions
              imageId={masterImage.id}
              canDelete={true}
              onDeleteRequest={handleDeleteImage}
              onActionError={setActionError}
            />
          </SidebarMenuItem>
          {actionError ? <div className="px-2 text-[11px] text-destructive">{actionError}</div> : null}
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={selectedKind === "grid" && hasGrid}
              className="text-xs"
              aria-disabled={!hasGrid}
              onClick={() => {
                if (!hasGrid) return
                onSelect(gridNavId)
              }}
            >
              <Grid3x3 />
              <span>Grid</span>
            </SidebarMenuButton>
            {hasGrid ? (
              <SidebarMenuAction showOnHover aria-label="Delete Grid" onClick={() => void onGridDeleteRequested()}>
                <Trash2 />
              </SidebarMenuAction>
            ) : (
              <SidebarMenuAction aria-label="Add Grid" onClick={() => void onGridCreateRequested()}>
                <Plus />
              </SidebarMenuAction>
            )}
          </SidebarMenuItem>
        </>
      ) : (
        <SidebarMenuItem>
          <SidebarMenuButton className="text-xs" disabled>
            <ImageIcon />
            <span>Image</span>
          </SidebarMenuButton>
          <AddImageMenuAction projectId={projectId} onUploaded={onImageUploaded} />
        </SidebarMenuItem>
      )}
    </SidebarMenu>
  )
}
