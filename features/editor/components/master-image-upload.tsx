"use client"

/**
 * Master image upload widget (editor feature).
 *
 * Responsibilities:
 * - Provide drag-and-drop upload UI for the project's master image.
 * - Validate image format/dimensions client-side before upload.
 */
import { useCallback, useEffect, useState } from "react"
import { useDropzone } from "react-dropzone"
import { ImagePlus } from "lucide-react"

import { cn } from "@/lib/utils"
import { hasMasterImage } from "@/lib/api/project-images"
import { uploadMasterImageClient } from "@/lib/editor/upload-master-image"
import { formatKbRounded } from "@/lib/utils/file-size"
import { Button } from "@/components/ui/button"

export function shouldRenderMasterImageUpload(args: {
  status: "checking" | "show" | "hide"
  variant: "panel" | "toolbar"
}): boolean {
  const { status, variant } = args
  if (status === "checking") return false
  if (variant !== "toolbar" && status === "hide") return false
  return true
}

export function MasterImageUpload({
  projectId,
  onUploaded,
  onUploadingChange,
  variant = "panel",
}: {
  projectId: string
  onUploaded: () => void
  onUploadingChange?: (uploading: boolean) => void
  variant?: "panel" | "toolbar"
}) {
  const [status, setStatus] = useState<"checking" | "show" | "hide">("checking")
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string>("")

  useEffect(() => {
    let cancelled = false
    setStatus("checking")
    hasMasterImage(projectId).then((exists) => {
      if (cancelled) return
      setStatus(exists ? "hide" : "show")
    })
    return () => {
      cancelled = true
    }
  }, [projectId])

  const uploadFile = useCallback(
    async (nextFile: File) => {
      if (isUploading) return
      setError("")
      setFile(nextFile)
      setIsUploading(true)
      onUploadingChange?.(true)
      try {
        const out = await uploadMasterImageClient({ projectId, file: nextFile })
        if (!out.ok) {
          setError(out.error)
          return
        }

        setStatus("hide")
        onUploaded()
      } finally {
        setIsUploading(false)
        onUploadingChange?.(false)
      }
    },
    [isUploading, onUploaded, onUploadingChange, projectId]
  )

  const onDrop = useCallback(
    (accepted: File[]) => {
      const f = accepted[0]
      if (!f) return
      void uploadFile(f)
    },
    [uploadFile]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
    multiple: false,
    maxFiles: 1,
    disabled: isUploading,
  })

  if (!shouldRenderMasterImageUpload({ status, variant })) {
    return null
  }

  if (variant === "toolbar") {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={isUploading}
        aria-label="Add image"
        title="Add image"
        {...getRootProps()}
      >
        <input {...getInputProps()} />
        <ImagePlus className="size-6" strokeWidth={1} />
      </Button>
    )
  }

  return (
    <div className="w-[320px]">
      <div
        {...getRootProps({
          className: cn(
            "rounded-lg border bg-background p-6",
            isDragActive ? "border-primary" : "border-border"
          ),
        })}
      >
        <input {...getInputProps()} />

        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium">Upload master image</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Drag an image here or click to select a file.
            </div>
            {file ? (
              <div className="mt-3 text-sm">
                <div className="font-medium">{file.name}</div>
                <div className="text-muted-foreground">{formatKbRounded(file.size)}</div>
              </div>
            ) : null}
            {error ? <div className="mt-3 text-sm text-destructive">{error}</div> : null}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            {isUploading ? <div className="text-sm text-muted-foreground">Uploading…</div> : null}
          </div>
        </div>

        <div className="mt-4 text-xs text-muted-foreground">
          Only 1 file. Allowed: images.
        </div>
      </div>
    </div>
  )
}
