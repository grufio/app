/**
 * React hook for loading and managing project image lists.
 *
 * Responsibilities:
 * - Fetch the project's master images list.
 * - Provide refresh and delete helpers for UI integration.
 */
"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { deleteMasterImageById, listMasterImages, setProjectImageLocked, type ProjectImageItem } from "@/lib/api/project-images"
import { createSerialWriteChannel } from "@/lib/utils/serial-write-channel"

function imageListSignature(projectId: string, items: ProjectImageItem[]): string {
  return `${projectId}::${items
    .map((img) => `${img.id}|${img.is_active ? 1 : 0}|${img.is_locked ? 1 : 0}|${img.name ?? ""}|${img.created_at ?? ""}`)
    .join("::")}`
}

export function useProjectImages(projectId: string) {
  const [images, setImages] = useState<ProjectImageItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const mountedRef = useRef(true)
  const inflightRef = useRef<Promise<void> | null>(null)
  const lastSignatureRef = useRef<string>("")
  const mutationChannelRef = useRef(createSerialWriteChannel())
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    if (inflightRef.current) return await inflightRef.current
    if (!mountedRef.current) return
    const p = (async () => {
      setError((prev) => (prev === "" ? prev : ""))
      setLoading(true)
      try {
        const items = await listMasterImages(projectId)
        if (mountedRef.current) {
          const nextSig = imageListSignature(projectId, items)
          if (nextSig !== lastSignatureRef.current) {
            lastSignatureRef.current = nextSig
            setImages(items)
          }
        }
      } catch (e) {
        if (mountedRef.current) {
          lastSignatureRef.current = ""
          setImages([])
          setError(e instanceof Error ? e.message : "Failed to load images")
        }
      } finally {
        if (mountedRef.current) setLoading(false)
      }
    })()
    inflightRef.current = p
    try {
      await p
    } finally {
      inflightRef.current = null
    }
  }, [projectId])

  const deleteById = useCallback(
    async (imageId: string) => {
      if (!mountedRef.current) return { ok: false as const, error: "Unmounted" }
      return mutationChannelRef.current.enqueueLatest(async () => {
        setError("")
        try {
          await deleteMasterImageById(projectId, imageId)
          await refresh()
          return { ok: true as const }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Failed to delete image"
          if (mountedRef.current) setError(msg)
          return { ok: false as const, error: msg }
        }
      })
    },
    [projectId, refresh]
  )

  const setLockedById = useCallback(
    async (imageId: string, isLocked: boolean) => {
      if (!mountedRef.current) return { ok: false as const, error: "Unmounted" }
      return mutationChannelRef.current.enqueueLatest(async () => {
        setError("")
        const prevImages = images
        if (mountedRef.current) {
          setImages((prev) => prev.map((img) => (img.id === imageId ? { ...img, is_locked: isLocked } : img)))
        }
        try {
          await setProjectImageLocked(projectId, imageId, isLocked)
          return { ok: true as const }
        } catch (e) {
          if (mountedRef.current) {
            setImages(prevImages)
          }
          await refresh()
          const msg = e instanceof Error ? e.message : "Failed to update image lock"
          if (mountedRef.current) setError(msg)
          return { ok: false as const, error: msg }
        }
      })
    },
    [images, projectId, refresh]
  )

  useEffect(() => {
    void refresh()
  }, [projectId, refresh])

  return {
    images,
    loading,
    error,
    setError,
    refresh,
    deleteById,
    setLockedById,
  }
}
