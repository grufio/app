"use client"

/**
 * React hook for master image lifecycle.
 *
 * Responsibilities:
 * - Load/refresh the project's master image metadata and signed URL.
 * - Provide deletion workflow and error/loading state.
 */
import { useCallback, useEffect, useRef, useState } from "react"

import { deleteMasterImage, getMasterImage } from "@/lib/api/project-images"
import { reportClientError } from "@/lib/monitoring/with-error-reporting"

export type MasterImage = {
  id: string
  /** Stable per-project identity = the immutable `kind='master'` row id.
   * Distinct from `id` (the active/editor-target image, which flips on
   * filter/crop/trace apply). Used as the reset key for the persisted
   * display transform + canvas mirror so those survive an apply and
   * only reset on a real master delete/replace. Null when no master. */
  masterRowId: string | null
  /** Signed URL of the **active** image row — the working_copy /
   * filter_working_copy / trace_output chain tip. Default canvas
   * base, error-boundary reset key, right-panel thumbnail source. */
  signedUrl: string
  /** Signed URL of the **kind='master'** row specifically — the raw
   * initial upload. Read by `pickCanvasImage` on the Image / Artboard
   * section to surface the raw master regardless of which row is
   * active. Empty string when master sign failed (graceful degrade
   * to working-copy URL). See `lib/editor/canvas-image-invariant.ts`. */
  masterSignedUrl: string
  width_px: number
  height_px: number
  dpi: number | null
  name: string
  restore_base?: {
    id: string
    width_px: number
    height_px: number
    dpi?: number | null
  } | null
}

function toMasterImage(payload: {
  id?: unknown
  masterRowId?: unknown
  signedUrl?: unknown
  masterSignedUrl?: unknown
  width_px?: unknown
  height_px?: unknown
  dpi?: unknown
  name?: unknown
  restore_base?: unknown
}): MasterImage {
  const base = payload.restore_base as
    | { id?: unknown; width_px?: unknown; height_px?: unknown; dpi?: unknown }
    | null
    | undefined
  return {
    id: String(payload.id ?? ""),
    masterRowId: payload.masterRowId == null ? null : String(payload.masterRowId),
    signedUrl: String(payload.signedUrl ?? ""),
    masterSignedUrl: String(payload.masterSignedUrl ?? ""),
    width_px: Number(payload.width_px ?? 0),
    height_px: Number(payload.height_px ?? 0),
    dpi: payload.dpi == null ? null : Number(payload.dpi),
    name: String(payload.name ?? "master image"),
    restore_base:
      base && base.id != null
        ? {
            id: String(base.id),
            width_px: Number(base.width_px ?? 0),
            height_px: Number(base.height_px ?? 0),
            dpi: base.dpi == null ? null : Number(base.dpi),
          }
        : null,
  }
}

function masterImageSignature(img: MasterImage | null): string {
  if (!img) return "__missing__"
  return `${img.id}|${img.masterRowId ?? ""}|${img.signedUrl}|${img.masterSignedUrl}|${img.width_px}|${img.height_px}|${img.dpi ?? ""}|${img.name}|${img.restore_base?.id ?? ""}|${img.restore_base?.width_px ?? ""}|${img.restore_base?.height_px ?? ""}|${img.restore_base?.dpi ?? ""}`
}

export function useMasterImage(projectId: string, initialMasterImage?: MasterImage | null) {
  const [masterImage, setMasterImage] = useState<MasterImage | null>(() =>
    initialMasterImage?.signedUrl ? initialMasterImage : null
  )
  const [masterImageLoading, setMasterImageLoading] = useState(false)
  const [masterImageError, setMasterImageError] = useState("")

  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  const mountedRef = useRef(true)
  const refreshInflightRef = useRef<Promise<void> | null>(null)
  const lastLoadedSignatureRef = useRef<string>(masterImageSignature(initialMasterImage?.signedUrl ? initialMasterImage : null))
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const seedMasterImage = useCallback((nextImage: MasterImage | null) => {
    if (!mountedRef.current) return
    const nextSig = masterImageSignature(nextImage)
    lastLoadedSignatureRef.current = nextSig
    setMasterImage(nextImage)
    setMasterImageError("")
    setMasterImageLoading(false)
  }, [])

  const refreshMasterImage = useCallback(async () => {
    if (refreshInflightRef.current) return await refreshInflightRef.current
    if (!mountedRef.current) return
    const p = (async () => {
      setMasterImageError((prev) => (prev === "" ? prev : ""))
      setMasterImageLoading(true)
      try {
        const payload = await getMasterImage(projectId)
        if (!payload?.exists) {
          const nextSig = "__missing__"
          if (mountedRef.current && lastLoadedSignatureRef.current !== nextSig) {
            lastLoadedSignatureRef.current = nextSig
            setMasterImage(null)
          }
          return
        }
        const nextImage = toMasterImage(payload)
        const nextSig = masterImageSignature(nextImage)
        if (mountedRef.current && lastLoadedSignatureRef.current !== nextSig) {
          lastLoadedSignatureRef.current = nextSig
          setMasterImage(nextImage)
        }
      } catch (e) {
        if (mountedRef.current) {
          lastLoadedSignatureRef.current = "__missing__"
          setMasterImage(null)
          setMasterImageError(e instanceof Error ? e.message : "Failed to load image")
        }
        reportClientError(e, {
          scope: "editor",
          code: "MASTER_IMAGE_LOAD_FAILED",
          stage: "load",
          context: { projectId },
        })
      } finally {
        if (mountedRef.current) setMasterImageLoading(false)
      }
    })()
    refreshInflightRef.current = p
    try {
      await p
    } finally {
      refreshInflightRef.current = null
    }
  }, [projectId])

  const deleteImage = useCallback(async () => {
    if (deleteBusy) return { ok: false as const, error: "Delete already in progress" }
    if (!mountedRef.current) return { ok: false as const, error: "Unmounted" }
    setDeleteError("")
    setDeleteBusy(true)
    try {
      await deleteMasterImage(projectId)
      if (mountedRef.current) setMasterImage(null)
      // Ensure uploader shows again even if some cached state exists.
      void refreshMasterImage()
      return { ok: true as const }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to delete image"
      if (mountedRef.current) setDeleteError(msg)
      reportClientError(e, {
        scope: "editor",
        code: "MASTER_IMAGE_DELETE_FAILED",
        stage: "delete",
        context: { projectId },
      })
      return { ok: false as const, error: msg }
    } finally {
      if (mountedRef.current) setDeleteBusy(false)
    }
  }, [deleteBusy, projectId, refreshMasterImage])

  useEffect(() => {
    // If server already provided the master image, skip the initial fetch.
    if (initialMasterImage?.signedUrl) return
    void refreshMasterImage()
  }, [initialMasterImage?.signedUrl, refreshMasterImage])

  return {
    masterImage,
    masterImageLoading,
    masterImageError,
    refreshMasterImage,
    seedMasterImage,
    deleteBusy,
    deleteError,
    setDeleteError,
    deleteImage,
  }
}

