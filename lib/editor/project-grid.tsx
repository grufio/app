"use client"

/**
 * Project grid provider.
 *
 * Responsibilities:
 * - Load and persist grid settings (`project_grid`) for the current project.
 * - Expose derived pixel values for rendering.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { pxUToUnitDisplay, type Unit, unitToPx, unitToPxU } from "@/lib/editor/units"
import { useProjectWorkspace } from "@/lib/editor/project-workspace"
import {
  defaultGrid,
  insertGrid,
  mapGridSchemaError,
  normalizeProjectGridRow,
  normalizeUnit as normalizeGridUnit,
  selectGrid,
  upsertGrid as upsertGridRepo,
} from "@/services/editor"

export type ProjectGridRow = import("@/services/editor").ProjectGridRow

type ProjectGridContextValue = {
  projectId: string
  row: ProjectGridRow | null
  loading: boolean
  saving: boolean
  error: string
  refresh: () => Promise<void>
  upsertGrid: (nextRow: ProjectGridRow) => Promise<ProjectGridRow | null>
  // convenience for rendering
  spacingXPx: number | null
  spacingYPx: number | null
  lineWidthPx: number | null
}

const ProjectGridContext = createContext<ProjectGridContextValue | null>(null)

export function ProjectGridProvider({
  projectId,
  initialRow = null,
  children,
}: {
  projectId: string
  initialRow?: ProjectGridRow | null
  children: React.ReactNode
}) {
  const { unit: workspaceUnit, dpi: workspaceDpi } = useProjectWorkspace()
  const [row, setRow] = useState<ProjectGridRow | null>(() => (initialRow?.project_id === projectId ? initialRow : null))
  const [loading, setLoading] = useState(() => !(initialRow?.project_id === projectId))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const refresh = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const supabase = createSupabaseBrowserClient()
      const { row: data, error: selErr } = await selectGrid(supabase, projectId)
      if (selErr) {
        setRow(null)
        setError(mapGridSchemaError(selErr))
        return
      }

      if (!data) {
        const unit = workspaceUnit ?? "cm"
        const def = defaultGrid(projectId, unit)
        const { row: ins, error: insErr } = await insertGrid(supabase, def)
        if (insErr || !ins) {
          setRow(null)
          setError(mapGridSchemaError(insErr ?? "Failed to create default grid"))
          return
        }

        setRow(normalizeProjectGridRow(ins))
        return
      }

      setRow(normalizeProjectGridRow(data))
    } finally {
      setLoading(false)
    }
  }, [projectId, workspaceUnit])

  useEffect(() => {
    // If server provided initial data, don't refetch on mount.
    if (initialRow?.project_id === projectId) return
    void refresh()
  }, [initialRow?.project_id, projectId, refresh])

  const upsertGrid = useCallback(
    async (nextRow: ProjectGridRow): Promise<ProjectGridRow | null> => {
      if (saving) return null
      setSaving(true)
      setError("")
      try {
        const supabase = createSupabaseBrowserClient()
        const { row: data, error: upErr } = await upsertGridRepo(supabase, nextRow)
        if (upErr || !data) {
          setError(mapGridSchemaError(upErr ?? "Failed to save grid"))
          return null
        }

        const normalized = normalizeProjectGridRow(data)
        setRow(normalized)
        return normalized as unknown as ProjectGridRow
      } finally {
        setSaving(false)
      }
    },
    [saving]
  )

  // Keep grid unit in sync with workspace unit (artboard is the source of truth).
  useEffect(() => {
    if (!row) return
    if (!workspaceUnit) return
    if (!workspaceDpi) return
    if (row.unit === workspaceUnit) return

    const dpi = Number(workspaceDpi)
    if (!Number.isFinite(dpi) || dpi <= 0) return

    // Convert via µpx so 10 cm → 100 mm exactly (no float px roundtrip).
    let xPxU: bigint
    let yPxU: bigint
    let lwPxU: bigint
    try {
      xPxU = unitToPxU(String(row.spacing_x_value), row.unit, dpi)
      yPxU = unitToPxU(String(row.spacing_y_value), row.unit, dpi)
      lwPxU = unitToPxU(String(row.line_width_value), row.unit, dpi)
    } catch {
      return
    }

    const next: ProjectGridRow = {
      ...row,
      unit: workspaceUnit,
      spacing_x_value: Number(pxUToUnitDisplay(xPxU, workspaceUnit, dpi)),
      spacing_y_value: Number(pxUToUnitDisplay(yPxU, workspaceUnit, dpi)),
      line_width_value: Number(pxUToUnitDisplay(lwPxU, workspaceUnit, dpi)),
    }
    void upsertGrid(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.unit, workspaceUnit, workspaceDpi])

  const value = useMemo<ProjectGridContextValue>(() => {
    const unit = row ? normalizeGridUnit((row as unknown as { unit?: unknown })?.unit) : null
    const dpi = Number(workspaceDpi ?? NaN)
    const canConvert = Boolean(unit && Number.isFinite(dpi) && dpi > 0)

    const spacingXPx =
      row && canConvert ? Number(unitToPx(Number(row.spacing_x_value), unit as Unit, dpi)) : null
    const spacingYPx =
      row && canConvert ? Number(unitToPx(Number(row.spacing_y_value), unit as Unit, dpi)) : null
    const lineWidthPx =
      row && canConvert ? Number(unitToPx(Number(row.line_width_value), unit as Unit, dpi)) : null

    return {
      projectId,
      row,
      loading,
      saving,
      error,
      refresh,
      upsertGrid,
      spacingXPx,
      spacingYPx,
      lineWidthPx,
    }
  }, [error, loading, projectId, refresh, row, saving, upsertGrid, workspaceDpi])

  return <ProjectGridContext.Provider value={value}>{children}</ProjectGridContext.Provider>
}

export function useProjectGrid() {
  const ctx = useContext(ProjectGridContext)
  if (!ctx) throw new Error("useProjectGrid must be used within ProjectGridProvider")
  return ctx
}

