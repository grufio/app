"use client"

import * as React from "react"
import { Image as ImageIcon, LayoutGrid, Plus } from "lucide-react"

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { buildNavId, parseNavId } from "@/features/editor/navigation/nav-id"

type EditorNavImage = { id: string; label: string }

export function EditorNavTree(props: {
  selectedId: string
  onSelect: (id: string) => void
  images: EditorNavImage[]
}) {
  const { selectedId, onSelect, images } = props

  const artboardNavId = React.useMemo(() => buildNavId({ kind: "artboard" }), [])
  const firstImageNavId = React.useMemo(
    () => (images.length > 0 ? buildNavId({ kind: "image", imageId: images[0].id }) : null),
    [images]
  )
  const selectedKind = React.useMemo(() => parseNavId(selectedId).kind, [selectedId])
  const imageTargetNavId = selectedKind === "image" ? selectedId : firstImageNavId

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
        </SidebarMenuItem>
      ) : (
        <SidebarMenuItem>
          <SidebarMenuButton className="text-xs">
            <Plus />
            <span>Add Image</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      )}
    </SidebarMenu>
  )
}
