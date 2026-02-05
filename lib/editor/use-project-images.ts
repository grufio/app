/**
 * React hook for loading and managing project image lists.
 *
 * Responsibilities:
 * - Fetch the project's master images list.
 * - Provide refresh and delete helpers for UI integration.
 */
"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { deleteMasterImageById, listMasterImages, type ProjectImageItem } from "@/lib/api/project-images"

export function useProjectImages(projectId: string) {
  const [images, setImages] = useState<ProjectImageItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!mountedRef.current) return
    setError("")
    setLoading(true)
    try {
      const items = await listMasterImages(projectId)
      if (mountedRef.current) setImages(items)
    } catch (e) {
      if (mountedRef.current) {
        setImages([])
        setError(e instanceof Error ? e.message : "Failed to load images")
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [projectId])

  const deleteById = useCallback(
    async (imageId: string) => {
      if (!mountedRef.current) return { ok: false as const, error: "Unmounted" }
      setError("")
      try {
        await deleteMasterImageById(projectId, imageId)
        void refresh()
        return { ok: true as const }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to delete image"
        if (mountedRef.current) setError(msg)
        return { ok: false as const, error: msg }
      }
    },
    [projectId, refresh]
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    images,
    loading,
    error,
    setError,
    refresh,
    deleteById,
  }
}
