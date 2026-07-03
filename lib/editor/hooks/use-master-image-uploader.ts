"use client"

/**
 * Master-image upload, as a reusable hook.
 *
 * Wraps the react-dropzone file input + the `uploadMasterImageClient`
 * pipeline + the busy flag + error toasts, so any "Add image" affordance
 * can open the OS / mobile file picker DIRECTLY (a single tap → native
 * picker), instead of routing through an intermediate sheet.
 *
 * Usage: call the hook, render `<input {...getInputProps()} />` once
 * (hidden), and call `openFilePicker()` from a real user-gesture click
 * handler (dropzone's `open()` clicks the input ref).
 */
import { useCallback, useState } from "react"
import { useDropzone } from "react-dropzone"
import { toast } from "sonner"

import { formatOperationErrorForToast, normalizeApiError } from "@/lib/api/error-normalizer"
import { uploadMasterImageClient, type UploadedMasterSnapshot } from "@/lib/editor/upload-master-image"

export function useMasterImageUploader({
  projectId,
  onUploaded,
}: {
  projectId: string
  onUploaded: (master: UploadedMasterSnapshot | null) => void | Promise<void>
}) {
  const [isUploading, setIsUploading] = useState(false)

  const uploadFile = useCallback(
    async (nextFile: File) => {
      if (isUploading) return
      setIsUploading(true)
      try {
        const out = await uploadMasterImageClient({ projectId, file: nextFile })
        if (!out.ok) {
          const formatted = formatOperationErrorForToast(normalizeApiError(out.error))
          toast.error(formatted.title, formatted.detail ? { description: formatted.detail } : undefined)
          return
        }
        await onUploaded(out.master)
      } catch (error) {
        const formatted = formatOperationErrorForToast(normalizeApiError(error))
        toast.error(formatted.title, formatted.detail ? { description: formatted.detail } : undefined)
      } finally {
        setIsUploading(false)
      }
    },
    [isUploading, onUploaded, projectId],
  )

  const onDrop = useCallback(
    (accepted: File[]) => {
      const f = accepted[0]
      if (!f) return
      void uploadFile(f)
    },
    [uploadFile],
  )

  const { getInputProps, open: openFilePicker } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
    multiple: false,
    maxFiles: 1,
    disabled: isUploading,
    noClick: true,
    noKeyboard: true,
  })

  return { getInputProps, openFilePicker, isUploading }
}
