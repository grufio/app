"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { clampPx, pxUToPxNumber, type Unit, unitToPxU } from "@/lib/editor/units"

export type WorkspaceRow = {
  project_id: string
  unit: Unit
  width_value: number
  height_value: number
  dpi_x: number
  dpi_y: number
  width_px_u: string
  height_px_u: string
  width_px: number
  height_px: number
  raster_effects_preset?: "high" | "medium" | "low" | null
}

function normalizeUnit(u: unknown): Unit {
  if (u === "mm" || u === "cm" || u === "pt" || u === "px") return u
  return "cm"
}

function defaultWorkspace(projectId: string): WorkspaceRow {
  // Default: 20x30cm @ 300dpi (Illustrator-like "new document")
  const unit: Unit = "cm"
  const width_value = 20
  const height_value = 30
  const dpi_x = 300
  const dpi_y = 300
  const widthPxU = unitToPxU(String(width_value), unit, dpi_x)
  const heightPxU = unitToPxU(String(height_value), unit, dpi_y)
  return {
    project_id: projectId,
    unit,
    width_value,
    height_value,
    dpi_x,
    dpi_y,
    raster_effects_preset: "high",
    width_px_u: widthPxU.toString(),
    height_px_u: heightPxU.toString(),
    width_px: clampPx(pxUToPxNumber(widthPxU)),
    height_px: clampPx(pxUToPxNumber(heightPxU)),
  }
}

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

  const refresh = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const supabase = createSupabaseBrowserClient()
      const { data, error: selErr } = await supabase
        .from("project_workspace")
        .select("project_id,unit,width_value,height_value,dpi_x,dpi_y,width_px_u,height_px_u,width_px,height_px,raster_effects_preset")
        .eq("project_id", projectId)
        .maybeSingle()

      if (selErr) {
        setRow(null)
        setError(selErr.message)
        return
      }

      if (!data) {
        const def = defaultWorkspace(projectId)
        const { data: ins, error: insErr } = await supabase
          .from("project_workspace")
          .insert(def)
          .select("project_id,unit,width_value,height_value,dpi_x,dpi_y,width_px_u,height_px_u,width_px,height_px,raster_effects_preset")
          .single()

        if (insErr || !ins) {
          setRow(null)
          setError(insErr?.message ?? "Failed to create default artboard")
          return
        }

        const r = ins as unknown as WorkspaceRow
        setRow({ ...r, unit: normalizeUnit((r as unknown as { unit?: unknown })?.unit) })
        return
      }

      const r = data as unknown as WorkspaceRow
      setRow({ ...r, unit: normalizeUnit((r as unknown as { unit?: unknown })?.unit) })
    } finally {
      setLoading(false)
    }
  }, [projectId])

  const upsertWorkspace = useCallback(
    async (nextRow: WorkspaceRow): Promise<WorkspaceRow | null> => {
      if (saving) return null
      setSaving(true)
      setError("")
      try {
        const supabase = createSupabaseBrowserClient()
        const { data, error: upErr } = await supabase
          .from("project_workspace")
          .upsert(nextRow, { onConflict: "project_id" })
          .select("project_id,unit,width_value,height_value,dpi_x,dpi_y,width_px_u,height_px_u,width_px,height_px,raster_effects_preset")
          .single()
        if (upErr || !data) {
          setError(upErr?.message ?? "Failed to save workspace")
          return null
        }
        const r = data as unknown as WorkspaceRow
        const normalized = { ...r, unit: normalizeUnit((r as unknown as { unit?: unknown })?.unit) }
        setRow(normalized)
        return normalized
      } finally {
        setSaving(false)
      }
    },
    [saving]
  )

  useEffect(() => {
    // If server provided initial data, don't refetch on mount.
    if (initialRow?.project_id === projectId) return
    void refresh()
  }, [initialRow?.project_id, projectId, refresh])

  const value = useMemo<WorkspaceContextValue>(() => {
    const unit = row ? normalizeUnit((row as unknown as { unit?: unknown })?.unit) : null
    const dpi = row && Number.isFinite(Number(row.dpi_x)) ? Number(row.dpi_x) : null
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

