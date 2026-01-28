"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { pxUToUnitDisplay, type Unit, unitToPx, unitToPxU } from "@/lib/editor/units"
import { useProjectWorkspace } from "@/lib/editor/project-workspace"

export type ProjectGridRow = {
  project_id: string
  color: string
  unit: Unit
  // Legacy single-axis spacing column (still NOT NULL in DB).
  // Keep it in sync with spacing_x_value to satisfy constraints.
  spacing_value: number
  spacing_x_value: number
  spacing_y_value: number
  line_width_value: number
}

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

function normalizeUnit(u: unknown): Unit {
  if (u === "mm" || u === "cm" || u === "pt" || u === "px") return u
  return "cm"
}

function normalizeHexColor(input: unknown): string {
  if (typeof input !== "string") return "#000000"
  const s = input.trim()
  const m = /^#([0-9a-fA-F]{6})$/.exec(s)
  if (!m) return "#000000"
  return `#${m[1].toLowerCase()}`
}

function defaultGrid(projectId: string, unit: Unit): ProjectGridRow {
  return {
    project_id: projectId,
    unit,
    color: "#000000",
    spacing_value: 10,
    spacing_x_value: 10,
    spacing_y_value: 10,
    line_width_value: 0.1,
  }
}

function mapGridSchemaError(message: string): string {
  // Most common local/dev issue: migration not applied to the DB yet.
  if (
    /column .*spacing_x_value.* does not exist/i.test(message) ||
    /column .*spacing_y_value.* does not exist/i.test(message)
  ) {
    return 'Grid storage is not ready. Apply migration "db/012_project_grid_xy.sql" to your database.'
  }
  return message
}

export function ProjectGridProvider({ projectId, children }: { projectId: string; children: React.ReactNode }) {
  const { unit: workspaceUnit, dpi: workspaceDpi } = useProjectWorkspace()
  const [row, setRow] = useState<ProjectGridRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const refresh = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const supabase = createSupabaseBrowserClient()
      const { data, error: selErr } = await supabase
        .from("project_grid")
        .select("project_id,color,unit,spacing_x_value,spacing_y_value,line_width_value")
        .eq("project_id", projectId)
        .maybeSingle()

      if (selErr) {
        setRow(null)
        setError(mapGridSchemaError(selErr.message))
        return
      }

      if (!data) {
        const unit = workspaceUnit ?? "cm"
        const def = defaultGrid(projectId, unit)
        const { data: ins, error: insErr } = await supabase
          .from("project_grid")
          .insert(def)
          .select("project_id,color,unit,spacing_x_value,spacing_y_value,line_width_value")
          .single()

        if (insErr || !ins) {
          setRow(null)
          setError(mapGridSchemaError(insErr?.message ?? "Failed to create default grid"))
          return
        }

        const r = ins as unknown as ProjectGridRow
        setRow({
          ...r,
          unit: normalizeUnit((r as unknown as { unit?: unknown })?.unit),
          color: normalizeHexColor((r as unknown as { color?: unknown })?.color),
        })
        return
      }

      const r = data as unknown as ProjectGridRow
      setRow({
        ...r,
        unit: normalizeUnit((r as unknown as { unit?: unknown })?.unit),
        color: normalizeHexColor((r as unknown as { color?: unknown })?.color),
      })
    } finally {
      setLoading(false)
    }
  }, [projectId, workspaceUnit])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const upsertGrid = useCallback(
    async (nextRow: ProjectGridRow): Promise<ProjectGridRow | null> => {
      if (saving) return null
      setSaving(true)
      setError("")
      try {
        const supabase = createSupabaseBrowserClient()
        const { data, error: upErr } = await supabase
          .from("project_grid")
          .upsert(nextRow, { onConflict: "project_id" })
          .select("project_id,color,unit,spacing_x_value,spacing_y_value,line_width_value")
          .single()

        if (upErr || !data) {
          setError(mapGridSchemaError(upErr?.message ?? "Failed to save grid"))
          return null
        }

        const r = data as unknown as ProjectGridRow
        const normalized = {
          ...r,
          unit: normalizeUnit((r as unknown as { unit?: unknown })?.unit),
          color: normalizeHexColor((r as unknown as { color?: unknown })?.color),
        }
        setRow(normalized)
        return normalized
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
    const unit = row ? normalizeUnit((row as unknown as { unit?: unknown })?.unit) : null
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

