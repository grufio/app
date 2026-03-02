"use client"

import { useCallback, useState } from "react"
import { Plus } from "lucide-react"
import { useDropzone } from "react-dropzone"
import { toast } from "sonner"

import { SidebarMenuAction } from "@/components/ui/sidebar"
import { uploadMasterImageClient } from "@/lib/editor/upload-master-image"

export function AddImageMenuAction({
  projectId,
  onUploaded,
}: {
  projectId: string
  onUploaded: () => void | Promise<void>
}) {
  const [isUploading, setIsUploading] = useState(false)

  const uploadFile = useCallback(
    async (nextFile: File) => {
      if (isUploading) return
      setIsUploading(true)
      try {
        const out = await uploadMasterImageClient({ projectId, file: nextFile })
        if (!out.ok) {
          toast.error(out.error)
          return
        }
        await onUploaded()
      } catch (error) {
        const message = error instanceof Error && error.message.trim() ? error.message : "Upload failed"
        toast.error(message)
      } finally {
        setIsUploading(false)
      }
    },
    [isUploading, onUploaded, projectId]
  )

  const onDrop = useCallback(
    (accepted: File[]) => {
      const f = accepted[0]
      if (!f) return
      void uploadFile(f)
    },
    [uploadFile]
  )

  const { getInputProps, open } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
    multiple: false,
    maxFiles: 1,
    disabled: isUploading,
    noClick: true,
    noKeyboard: true,
  })

  return (
    <>
      <input data-testid="add-image-input" {...getInputProps()} />
      <SidebarMenuAction onClick={open} disabled={isUploading} aria-label="Add Image">
        <Plus />
      </SidebarMenuAction>
    </>
  )
}
