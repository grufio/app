/**
 * React hook for loading the filter display image.
 *
 * Logic:
 * 1. Load working copy of active image
 * 2. Check if a filter result exists (source_image_id = workingCopy.id)
 * 3. If filter result exists: return filter result
 * 4. If not: return working copy
 */
"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { getOrCreateFilterWorkingCopy } from "@/lib/api/project-images"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

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

export function useFilterWorkingImage(projectId: string) {
  const [image, setImage] = useState<FilterDisplayImage | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const mountedRef = useRef(true)
  const inflightRef = useRef<Promise<void> | null>(null)

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
        const workingCopy = await getOrCreateFilterWorkingCopy(projectId)
        
        // Check if a filter result exists (has source_image_id = workingCopy.id)
        const supabase = createSupabaseBrowserClient()
        const { data: filterResult } = await supabase
          .from("project_images")
          .select("id,name,storage_bucket,storage_path,width_px,height_px,source_image_id")
          .eq("project_id", projectId)
          .eq("source_image_id", workingCopy.id)
          .eq("role", "asset")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()

        if (filterResult) {
          // Filter result exists, get signed URL and return it
          const { data: signedData } = await supabase.storage
            .from(String(filterResult.storage_bucket ?? "project_images"))
            .createSignedUrl(String(filterResult.storage_path), 3600)

          if (mountedRef.current) {
            setImage({
              id: filterResult.id,
              signedUrl: signedData?.signedUrl ?? "",
              width_px: filterResult.width_px,
              height_px: filterResult.height_px,
              storage_path: filterResult.storage_path,
              source_image_id: filterResult.source_image_id,
              name: filterResult.name,
              isFilterResult: true,
            })
          }
        } else {
          // No filter result, return working copy
          if (mountedRef.current) {
            setImage({
              ...workingCopy,
              isFilterResult: false,
            })
          }
        }
      } catch (e) {
        if (mountedRef.current) {
          setImage(null)
          setError(e instanceof Error ? e.message : "Failed to load filter working image")
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

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    image,
    loading,
    error,
    refresh,
  }
}
