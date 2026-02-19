"use client"

import * as React from "react"
import { Image as ImageIcon, LayoutGrid } from "lucide-react"

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { AddImageMenuAction } from "./add-image-menu-button"
import { DeleteImageMenuAction } from "./delete-image-menu-action"
import { buildNavId, parseNavId } from "@/features/editor/navigation/nav-id"

type EditorNavImage = { id: string; label: string }

export function EditorNavTree(props: {
  projectId: string
  selectedId: string
  onSelect: (id: string) => void
  images: EditorNavImage[]
  onImageUploaded: () => void | Promise<void>
  onImageDeleteRequested: (imageId: string) => void | Promise<void>
}) {
  const { projectId, selectedId, onSelect, images, onImageUploaded, onImageDeleteRequested } = props

  const artboardNavId = React.useMemo(() => buildNavId({ kind: "artboard" }), [])
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
          {imageTargetImageId ? (
            <DeleteImageMenuAction imageId={imageTargetImageId} onDeleteRequest={onImageDeleteRequested} />
          ) : null}
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
