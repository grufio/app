"use client"

import { Loader2, Plus } from "lucide-react"

import { SidebarMenuAction } from "@/components/ui/sidebar"
import { useMasterImageUploader } from "@/lib/editor/hooks/use-master-image-uploader"
import type { UploadedMasterSnapshot } from "@/lib/editor/upload-master-image"

export function AddImageMenuAction({
  projectId,
  onUploaded,
}: {
  projectId: string
  onUploaded: (master: UploadedMasterSnapshot | null) => void | Promise<void>
}) {
  const { getInputProps, openFilePicker, isUploading } = useMasterImageUploader({ projectId, onUploaded })

  return (
    <>
      <input data-testid="add-image-input" {...getInputProps()} />
      <SidebarMenuAction
        onClick={openFilePicker}
        disabled={isUploading}
        aria-label={isUploading ? "Uploading image" : "Add Image"}
        aria-busy={isUploading}
      >
        {isUploading ? <Loader2 className="animate-spin" /> : <Plus />}
      </SidebarMenuAction>
    </>
  )
}
