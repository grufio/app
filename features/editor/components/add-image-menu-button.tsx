"use client"

import { useCallback, useState } from "react"
import { Plus } from "lucide-react"
import { useDropzone } from "react-dropzone"

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
        if (!out.ok) return
        await onUploaded()
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
      <input {...getInputProps()} />
      <SidebarMenuAction onClick={open} disabled={isUploading} aria-label="Add Image">
        <Plus />
      </SidebarMenuAction>
    </>
  )
}
