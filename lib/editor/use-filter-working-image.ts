/**
 * React hook for loading the filter display image.
 *
 * Logic:
 * 1. Load working copy of active image
 * 2. Walk the entire filter chain starting from workingCopy
 * 3. Return the last filter result in the chain
 * 4. If no filters exist: return working copy
 */
"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { getOrCreateFilterWorkingCopy } from "@/lib/api/project-images"

export type FilterDisplayImage = {
  id: string
  signedUrl: string
  width_px: number
  height_px: number
  storage_path: string
  source_image_id: string | null
  name: string
  isFilterResult: boolean
}

export type FilterStackItem = {
  id: string
  name: string
  filterType: "pixelate" | "lineart" | "numerate" | "unknown"
  source_image_id: string | null
}

export function useFilterWorkingImage(projectId: string) {
  const [image, setImage] = useState<FilterDisplayImage | null>(null)
  const [stack, setStack] = useState<FilterStackItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const mountedRef = useRef(true)
  const inflightRef = useRef<Promise<void> | null>(null)
  const requestSeqRef = useRef(0)

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
      const seq = ++requestSeqRef.current
      setError((prev) => (prev === "" ? prev : ""))
      setLoading(true)
      try {
        const workingCopy = await getOrCreateFilterWorkingCopy(projectId)
        if (seq !== requestSeqRef.current || !mountedRef.current) return

        if (!workingCopy.exists) {
          setImage(null)
          setStack([])
          setError("")
          return
        }
        setImage({
          id: workingCopy.id,
          signedUrl: workingCopy.signedUrl,
          width_px: workingCopy.width_px,
          height_px: workingCopy.height_px,
          storage_path: workingCopy.storage_path,
          source_image_id: workingCopy.source_image_id,
          name: workingCopy.name,
          isFilterResult: workingCopy.isFilterResult,
        })
        setStack(workingCopy.stack)
      } catch (e) {
        if (seq !== requestSeqRef.current || !mountedRef.current) return
        setImage(null)
        setStack([])
        setError(e instanceof Error ? e.message : "Failed to load filter working image")
      } finally {
        if (seq === requestSeqRef.current && mountedRef.current) setLoading(false)
      }
    })()

    inflightRef.current = p
    try {
      await p
    } finally {
      inflightRef.current = null
    }
  }, [projectId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    image,
    stack,
    loading,
    error,
    refresh,
  }
}
