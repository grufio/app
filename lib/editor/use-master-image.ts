"use client"

import { useCallback, useEffect, useState } from "react"

import { deleteMasterImage, getMasterImage } from "@/lib/api/project-images"

export type MasterImage = {
  signedUrl: string
  width_px: number
  height_px: number
  dpi: number | null
  name: string
}

export function useMasterImage(projectId: string) {
  const [masterImage, setMasterImage] = useState<MasterImage | null>(null)
  const [masterImageLoading, setMasterImageLoading] = useState(false)
  const [masterImageError, setMasterImageError] = useState("")

  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  const refreshMasterImage = useCallback(async () => {
    setMasterImageError("")
    setMasterImageLoading(true)
    try {
      const payload = await getMasterImage(projectId)
      if (!payload?.exists) {
        setMasterImage(null)
        return
      }
      setMasterImage({
        signedUrl: payload.signedUrl,
        width_px: Number(payload.width_px ?? 0),
        height_px: Number(payload.height_px ?? 0),
        dpi: payload.dpi == null ? null : Number(payload.dpi),
        name: String(payload.name ?? "master image"),
      })
    } catch (e) {
      setMasterImage(null)
      setMasterImageError(e instanceof Error ? e.message : "Failed to load image")
    } finally {
      setMasterImageLoading(false)
    }
  }, [projectId])

  const deleteImage = useCallback(async () => {
    if (deleteBusy) return { ok: false as const, error: "Delete already in progress" }
    setDeleteError("")
    setDeleteBusy(true)
    try {
      await deleteMasterImage(projectId)
      setMasterImage(null)
      // Ensure uploader shows again even if some cached state exists.
      void refreshMasterImage()
      return { ok: true as const }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to delete image"
      setDeleteError(msg)
      return { ok: false as const, error: msg }
    } finally {
      setDeleteBusy(false)
    }
  }, [deleteBusy, projectId, refreshMasterImage])

  useEffect(() => {
    void refreshMasterImage()
  }, [refreshMasterImage])

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

