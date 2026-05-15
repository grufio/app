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

type EditorNavImage = { id: string; label: string }

export type EditorNavTreeData = {
  validIds: Set<string>
}

export function buildEditorNavTreeData(images: EditorNavImage[]): EditorNavTreeData {
  const ids = new Set<string>()
  ids.add(buildNavId({ kind: "artboard" }))
  ids.add(buildNavId({ kind: "imagesFolder" }))
  ids.add(buildNavId({ kind: "grid" }))
  for (const img of images) {
    if (!img?.id) continue
    ids.add(buildNavId({ kind: "image", imageId: img.id }))
  }
  return { validIds: ids }
}

export function resolveEditorNavSelectedItemId(selectedId: string, data: EditorNavTreeData): string | null {
  if (!selectedId) return null
  if (!data?.validIds) return null
  return data.validIds.has(selectedId) ? selectedId : null
}

export function EditorNavTree(props: {
  projectId: string
  selectedId: string
  onSelect: (id: string) => void
  images: EditorNavImage[]
  hasGrid: boolean
  onImageUploaded: () => void | Promise<void>
  onImageDeleteRequested: (imageId: string) => void | Promise<void>
  /** When true, render the trash icon on the Image entry. The master
   * is the only delete-target (cascade through derivatives), so this
   * is a simple existence flag — `Boolean(masterImage)` upstream. */
  canDeleteMaster: boolean
  onGridCreateRequested: () => void | Promise<void>
  onGridDeleteRequested: () => void | Promise<void>
}) {
  const {
    projectId,
    selectedId,
    onSelect,
    images,
    hasGrid,
    onImageUploaded,
    onImageDeleteRequested,
    canDeleteMaster,
    onGridCreateRequested,
    onGridDeleteRequested,
  } = props

  const artboardNavId = React.useMemo(() => buildNavId({ kind: "artboard" }), [])
  const gridNavId = React.useMemo(() => buildNavId({ kind: "grid" }), [])
  const firstImageNavId = React.useMemo(
    () => (images.length > 0 ? buildNavId({ kind: "image", imageId: images[0].id }) : null),
    [images]
  )
  const selectedKind = React.useMemo(() => parseNavId(selectedId).kind, [selectedId])
  const imageTargetNavId = selectedKind === "image" ? selectedId : firstImageNavId
  const imageTargetImageId = React.useMemo(() => {
    if (!imageTargetNavId) return null
    const parsed = parseNavId(imageTargetNavId)
    return parsed.kind === "image" ? parsed.imageId : null
  }, [imageTargetNavId])
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
    [onImageDeleteRequested]
  )

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton isActive={selectedKind === "artboard"} className="text-xs" onClick={() => onSelect(artboardNavId)}>
          <LayoutGrid />
          <span>Artboard</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      {imageTargetNavId ? (
        <>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={selectedKind === "image"}
              className="text-xs"
              onClick={() => onSelect(imageTargetNavId)}
            >
              <ImageIcon />
              <span>Image</span>
            </SidebarMenuButton>
            {imageTargetImageId ? (
              <LockNavTreeActions
                imageId={imageTargetImageId}
                canDelete={canDeleteMaster}
                onDeleteRequest={handleDeleteImage}
                onActionError={setActionError}
              />
            ) : null}
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
