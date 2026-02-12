"use client"

/**
 * Project workspace (artboard) provider.
 *
 * Responsibilities:
 * - Load and persist `project_workspace` (unit, DPI, canonical µpx size, page background).
 * - Expose derived convenience values (px/µpx) for editor components.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"

import type { Unit } from "@/lib/editor/units"
import {
  defaultWorkspace,
  normalizeWorkspaceRow,
} from "@/services/editor"
import { insertWorkspaceClient, selectWorkspaceClient, upsertWorkspaceClient } from "@/services/editor/workspace/client"

export type WorkspaceRow = import("@/services/editor").WorkspaceRow

type WorkspaceContextValue = {
  projectId: string
  row: WorkspaceRow | null
  loading: boolean
  saving: boolean
  error: string
  refresh: () => Promise<void>
  upsertWorkspace: (nextRow: WorkspaceRow) => Promise<WorkspaceRow | null>
  // convenience
  unit: Unit | null
  dpi: number | null
  widthPxU: bigint | null
  heightPxU: bigint | null
  widthPx: number | null
  heightPx: number | null
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function ProjectWorkspaceProvider({
  projectId,
  initialRow = null,
  children,
}: {
  projectId: string
  initialRow?: WorkspaceRow | null
  children: React.ReactNode
}) {
  const [row, setRow] = useState<WorkspaceRow | null>(() => (initialRow?.project_id === projectId ? initialRow : null))
  const [loading, setLoading] = useState(() => !(initialRow?.project_id === projectId))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const savingRef = useRef(false)
  useEffect(() => {
    savingRef.current = saving
  }, [saving])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const { row: data, error: selErr } = await selectWorkspaceClient(projectId)
      if (selErr) {
        setRow(null)
        setError(selErr)
        return
      }

      if (!data) {
        const def = defaultWorkspace(projectId)
        const { row: ins, error: insErr } = await insertWorkspaceClient(def)
        if (insErr || !ins) {
          setRow(null)
          setError(insErr ?? "Failed to create default artboard")
          return
        }

        setRow(normalizeWorkspaceRow(ins))
        return
      }

      setRow(normalizeWorkspaceRow(data))
    } finally {
      setLoading(false)
    }
  }, [projectId])

  const upsertWorkspace = useCallback(
    async (nextRow: WorkspaceRow): Promise<WorkspaceRow | null> => {
      if (savingRef.current) return null
      setSaving(true)
      setError("")
      try {
        const { row: data, error: upErr } = await upsertWorkspaceClient(nextRow)
        if (upErr || !data) {
          setError(upErr ?? "Failed to save workspace")
          return null
        }
        const normalized = normalizeWorkspaceRow(data)
        setRow(normalized)
        return normalized as unknown as WorkspaceRow
      } finally {
        setSaving(false)
      }
    },
    [savingRef]
  )

  useEffect(() => {
    // If server provided initial data, don't refetch on mount.
    if (initialRow?.project_id === projectId) return
    void refresh()
  }, [initialRow?.project_id, projectId, refresh])

  const value = useMemo<WorkspaceContextValue>(() => {
    // `row` is normalized when stored; avoid re-normalizing on every render.
    const unit = row ? (row as unknown as { unit?: Unit }).unit ?? null : null
    const dpi =
      row && Number.isFinite(Number((row as unknown as { output_dpi_x?: unknown })?.output_dpi_x ?? row.dpi_x))
        ? Number((row as unknown as { output_dpi_x?: unknown })?.output_dpi_x ?? row.dpi_x)
        : null
    const widthPxU =
      row && typeof (row as unknown as { width_px_u?: unknown })?.width_px_u === "string"
        ? (() => {
            try {
              return BigInt((row as unknown as { width_px_u: string }).width_px_u)
            } catch {
              return null
            }
          })()
        : null
    const heightPxU =
      row && typeof (row as unknown as { height_px_u?: unknown })?.height_px_u === "string"
        ? (() => {
            try {
              return BigInt((row as unknown as { height_px_u: string }).height_px_u)
            } catch {
              return null
            }
          })()
        : null
    const widthPx = row && Number.isFinite(Number(row.width_px)) ? Number(row.width_px) : null
    const heightPx = row && Number.isFinite(Number(row.height_px)) ? Number(row.height_px) : null
    return {
      projectId,
      row,
      loading,
      saving,
      error,
      refresh,
      upsertWorkspace,
      unit,
      dpi,
      widthPxU,
      heightPxU,
      widthPx,
      heightPx,
    }
  }, [error, loading, projectId, refresh, row, saving, upsertWorkspace])

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useProjectWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error("useProjectWorkspace must be used within ProjectWorkspaceProvider")
  return ctx
}

