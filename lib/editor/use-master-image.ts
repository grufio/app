"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { deleteMasterImage, getMasterImage } from "@/lib/api/project-images"

export type MasterImage = {
  signedUrl: string
  width_px: number
  height_px: number
  dpi: number | null
  name: string
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
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const refreshMasterImage = useCallback(async () => {
    if (!mountedRef.current) return
    setMasterImageError("")
    setMasterImageLoading(true)
    try {
      const payload = await getMasterImage(projectId)
      if (!payload?.exists) {
        if (mountedRef.current) setMasterImage(null)
        return
      }
      if (mountedRef.current) {
        setMasterImage({
          signedUrl: payload.signedUrl,
          width_px: Number(payload.width_px ?? 0),
          height_px: Number(payload.height_px ?? 0),
          dpi: payload.dpi == null ? null : Number(payload.dpi),
          name: String(payload.name ?? "master image"),
        })
      }
    } catch (e) {
      if (mountedRef.current) {
        setMasterImage(null)
        setMasterImageError(e instanceof Error ? e.message : "Failed to load image")
      }
    } finally {
      if (mountedRef.current) setMasterImageLoading(false)
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
    deleteBusy,
    deleteError,
    setDeleteError,
    deleteImage,
  }
}

