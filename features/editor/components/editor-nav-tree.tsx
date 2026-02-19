"use client"

import * as React from "react"
import { Grid3x3, Image as ImageIcon, LayoutGrid, Plus, Trash2 } from "lucide-react"

import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import { AddImageMenuAction } from "./add-image-menu-button"
import { DeleteImageMenuAction } from "./delete-image-menu-action"
import { buildNavId, parseNavId } from "@/features/editor/navigation/nav-id"

type EditorNavImage = { id: string; label: string }

export function EditorNavTree(props: {
  projectId: string
  selectedId: string
  onSelect: (id: string) => void
  images: EditorNavImage[]
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
    images,
    hasGrid,
    onImageUploaded,
    onImageDeleteRequested,
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

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton isActive={selectedKind === "artboard"} className="text-xs" onClick={() => onSelect(artboardNavId)}>
          <LayoutGrid />
          <span>Artboard</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      {imageTargetNavId ? (
        <SidebarMenuItem>
          <SidebarMenuButton isActive={selectedKind === "image"} className="text-xs" onClick={() => onSelect(imageTargetNavId)}>
            <ImageIcon />
            <span>Image</span>
          </SidebarMenuButton>
          {imageTargetImageId ? <DeleteImageMenuAction imageId={imageTargetImageId} onDeleteRequest={onImageDeleteRequested} /> : null}
          <SidebarMenuSub>
            <SidebarMenuSubItem>
              <SidebarMenuSubButton
                size="sm"
                className="h-8 text-xs"
                isActive={selectedKind === "grid" && hasGrid}
                aria-disabled={!hasGrid}
                onClick={(event) => {
                  if (!hasGrid) {
                    event.preventDefault()
                    return
                  }
                  onSelect(gridNavId)
                }}
              >
                <Grid3x3 />
                <span>Grid</span>
              </SidebarMenuSubButton>
              {hasGrid ? (
                <SidebarMenuAction className="top-1.5" aria-label="Delete Grid" onClick={() => void onGridDeleteRequested()}>
                  <Trash2 />
                </SidebarMenuAction>
              ) : (
                <SidebarMenuAction className="top-1.5" aria-label="Add Grid" onClick={() => void onGridCreateRequested()}>
                  <Plus />
                </SidebarMenuAction>
              )}
            </SidebarMenuSubItem>
          </SidebarMenuSub>
        </SidebarMenuItem>
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
