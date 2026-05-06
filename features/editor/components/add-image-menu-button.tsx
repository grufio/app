"use client"

import { useCallback, useState } from "react"
import { Loader2, Plus } from "lucide-react"
import { useDropzone } from "react-dropzone"
import { toast } from "sonner"

import { SidebarMenuAction } from "@/components/ui/sidebar"
import { normalizeApiError } from "@/lib/api/error-normalizer"
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
          const normalized = normalizeApiError(out.error)
          toast.error(normalized.title, normalized.detail ? { description: normalized.detail } : undefined)
          return
        }
        await onUploaded()
      } catch (error) {
        const normalized = normalizeApiError(error)
        toast.error(normalized.title, normalized.detail ? { description: normalized.detail } : undefined)
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
      <SidebarMenuAction
        onClick={open}
        disabled={isUploading}
        aria-label={isUploading ? "Uploading image" : "Add Image"}
        aria-busy={isUploading}
      >
        {isUploading ? (
          <Loader2 className="animate-spin" strokeWidth={1} />
        ) : (
          <Plus strokeWidth={1} />
        )}
      </SidebarMenuAction>
    </>
  )
}
