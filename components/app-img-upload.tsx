"use client"

/**
 * Image upload widget (master image).
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
import { getImageDimensions } from "@/lib/images/dimensions"
import { guessImageFormat } from "@/lib/images/format-detection"
import { formatKbRounded } from "@/lib/utils/file-size"
import { Button } from "@/components/ui/button"

export function ProjectImageUploader({
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
    onUploadingChange?.(isUploading)
  }, [isUploading, onUploadingChange])

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
      try {
        const { width, height } = await getImageDimensions(nextFile)
        const format = guessImageFormat(nextFile)
        const form = new FormData()
        form.set("file", nextFile)
        form.set("width_px", String(width))
        form.set("height_px", String(height))
        form.set("format", format)

        const res = await fetch(`/api/projects/${projectId}/images/master/upload`, {
          method: "POST",
          credentials: "same-origin",
          body: form,
        })
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null
          const stage = typeof payload?.stage === "string" ? ` (${payload.stage})` : ""
          const msg =
            typeof payload?.error === "string"
              ? payload.error
              : payload
                ? JSON.stringify(payload)
                : "No JSON error body returned"
          setError(`Upload failed (HTTP ${res.status})${stage}: ${msg}`)
          return
        }

        setStatus("hide")
        onUploaded()
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

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
    multiple: false,
    maxFiles: 1,
    disabled: isUploading,
  })

  if (variant !== "toolbar" && status === "hide") return null

  // Prevent flicker: don't render uploader until we know whether an image already exists.
  if (status === "checking") {
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

