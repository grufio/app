"use client"

import { Trash2 } from "lucide-react"

import { SidebarMenuAction } from "@/components/ui/sidebar"

export function DeleteImageMenuAction({
  imageId,
  onDeleteRequest,
}: {
  imageId: string
  onDeleteRequest: (imageId: string) => void | Promise<void>
}) {
  return (
    <SidebarMenuAction onClick={() => onDeleteRequest(imageId)} aria-label="Delete Image">
      <Trash2 />
    </SidebarMenuAction>
  )
}
