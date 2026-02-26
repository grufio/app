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

        if (!workingCopy.exists) {
          if (mountedRef.current) {
            setImage(null)
            setError("")
          }
          return
        }

        // Initialize currentImage with working copy
        let currentImage = {
          id: workingCopy.id,
          signedUrl: workingCopy.signedUrl,
          width_px: workingCopy.width_px,
          height_px: workingCopy.height_px,
          storage_path: workingCopy.storage_path,
          source_image_id: workingCopy.source_image_id,
          name: workingCopy.name,
          isFilterResult: false,
        }

        const supabase = createSupabaseBrowserClient()

        // Walk forward through the filter chain
        while (true) {
          const { data: nextFilter } = await supabase
            .from("project_images")
            .select("id,name,storage_bucket,storage_path,width_px,height_px,source_image_id")
            .eq("project_id", projectId)
            .eq("source_image_id", currentImage.id)
            .eq("role", "asset")
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()

          if (!nextFilter) {
            // No more filters in chain, currentImage is the last one
            break
          }

          // Get signed URL for this filter result
          const { data: signedData } = await supabase.storage
            .from(String(nextFilter.storage_bucket ?? "project_images"))
            .createSignedUrl(String(nextFilter.storage_path), 3600)

          // Update currentImage to this filter result
          currentImage = {
            id: nextFilter.id,
            signedUrl: signedData?.signedUrl ?? "",
            width_px: nextFilter.width_px,
            height_px: nextFilter.height_px,
            storage_path: nextFilter.storage_path,
            source_image_id: nextFilter.source_image_id,
            name: nextFilter.name,
            isFilterResult: true,
          }
        }

        // Return the last image in the chain
        if (mountedRef.current) {
          setImage(currentImage)
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
