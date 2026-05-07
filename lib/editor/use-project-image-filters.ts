"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import {
  applyProjectImageFilter,
  listProjectImageFilters,
  removeProjectImageFilter,
  type FilterType,
  type ProjectImageFilterItem,
} from "@/lib/api/project-images"
import { createSerialWriteChannel, isSupersededWriteError } from "@/lib/utils/serial-write-channel"
import { reportError } from "@/lib/monitoring/error-reporting"

export function useProjectImageFilters(projectId: string) {
  const [items, setItems] = useState<ProjectImageFilterItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const mountedRef = useRef(true)
  const inflightRef = useRef<Promise<void> | null>(null)
  const channelRef = useRef(createSerialWriteChannel())

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
      setLoading(true)
      setError((prev) => (prev === "" ? prev : ""))
      try {
        const next = await listProjectImageFilters(projectId)
        if (mountedRef.current) setItems(next)
      } catch (e) {
        if (mountedRef.current) {
          setItems([])
          setError(e instanceof Error ? e.message : "Failed to load filters")
        }
        void reportError(e instanceof Error ? e : new Error(String(e)), {
          scope: "editor",
          code: "PROJECT_FILTERS_LOAD_FAILED",
          stage: "load",
          severity: "warn",
          context: { projectId },
        })
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

  const apply = useCallback(
    async (filterType: FilterType, filterParams?: Record<string, unknown>) => {
      try {
        return await channelRef.current.enqueueLatest(async () => {
          setError("")
          try {
            const out = await applyProjectImageFilter({ projectId, filterType, filterParams })
            await refresh()
            return { ok: true as const, ...out }
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Failed to apply filter"
            if (mountedRef.current) setError(msg)
            return { ok: false as const, error: msg }
          }
        })
      } catch (e) {
        if (isSupersededWriteError(e)) return { ok: true as const }
        throw e
      }
    },
    [projectId, refresh]
  )

  const remove = useCallback(
    async (filterId: string) => {
      try {
        return await channelRef.current.enqueueLatest(async () => {
          setError("")
          try {
            const out = await removeProjectImageFilter({ projectId, filterId })
            await refresh()
            return { ok: true as const, ...out }
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Failed to remove filter"
            if (mountedRef.current) setError(msg)
            return { ok: false as const, error: msg }
          }
        })
      } catch (e) {
        if (isSupersededWriteError(e)) return { ok: true as const }
        throw e
      }
    },
    [projectId, refresh]
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    items,
    loading,
    error,
    setError,
    refresh,
    apply,
    remove,
  }
}

