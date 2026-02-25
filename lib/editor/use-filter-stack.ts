/**
 * React hook for loading the filter stack (chain of applied filters).
 */
"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

export type FilterStackItem = {
  id: string
  name: string
  filterType: "pixelate" | "lineart" | "numerate" | "unknown"
  source_image_id: string | null
}

export function useFilterStack(projectId: string, displayImageId: string | null) {
  const [stack, setStack] = useState<FilterStackItem[]>([])
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
    if (!displayImageId || !mountedRef.current) {
      setStack([])
      return
    }

    setLoading(true)
    setError("")

    try {
      const supabase = createSupabaseBrowserClient()
      const chain: FilterStackItem[] = []
      let currentId: string | null = displayImageId

      // Walk back the source_image_id chain until we hit working copy
      while (currentId) {
        const { data: img } = await supabase
          .from("project_images")
          .select("id,name,source_image_id,role")
          .eq("id", currentId)
          .eq("project_id", projectId)
          .is("deleted_at", null)
          .maybeSingle()

        if (!img) break

        if (img.role === "master") break

        // Check if this is a filter result (not working copy)
        if (img.name.includes("(filter working)")) {
          // This is the working copy - stop here
          break
        }

        // Determine filter type from name
        let filterType: "pixelate" | "lineart" | "numerate" | "unknown" = "unknown"
        if (img.name.includes("(pixelate)")) filterType = "pixelate"
        else if (img.name.includes("(line art)")) filterType = "lineart"
        else if (img.name.includes("(numerate)")) filterType = "numerate"

        chain.unshift({
          id: img.id,
          name: img.name,
          filterType,
          source_image_id: img.source_image_id,
        })

        // Move to source image
        currentId = img.source_image_id
      }

      if (mountedRef.current) {
        setStack(chain)
      }
    } catch (e) {
      if (mountedRef.current) {
        setStack([])
        setError(e instanceof Error ? e.message : "Failed to load filter stack")
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [projectId, displayImageId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    stack,
    loading,
    error,
    refresh,
  }
}
