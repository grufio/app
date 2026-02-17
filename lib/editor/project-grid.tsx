"use client"

/**
 * Project grid provider.
 *
 * Responsibilities:
 * - Load and persist grid settings (`project_grid`) for the current project.
 * - Expose derived pixel values for rendering.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"

import { pxUToUnitDisplayFixed, type Unit, unitToPxFixed, unitToPxUFixed } from "@/lib/editor/units"
import { useProjectWorkspace } from "@/lib/editor/project-workspace"
import {
  defaultGrid,
  mapGridSchemaError,
  normalizeProjectGridRow,
  normalizeUnit as normalizeGridUnit,
} from "@/services/editor"
import { insertGridClient, selectGridClient, upsertGridClient } from "@/services/editor/grid/client"

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

function gridRowSignature(row: ProjectGridRow | null): string {
  if (!row) return "null"
  return [
    row.project_id,
    row.unit,
    row.spacing_x_value,
    row.spacing_y_value,
    row.line_width_value,
    row.color,
    row.opacity_pct,
    row.visible,
  ].join("|")
}

export function ProjectGridProvider({
  projectId,
  initialRow = null,
  children,
}: {
  projectId: string
  initialRow?: ProjectGridRow | null
  children: React.ReactNode
}) {
  const { unit: workspaceUnit } = useProjectWorkspace()
  const [row, setRow] = useState<ProjectGridRow | null>(() => (initialRow?.project_id === projectId ? initialRow : null))
  const [loading, setLoading] = useState(() => !(initialRow?.project_id === projectId))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const savingRef = useRef(false)
  const rowRef = useRef<ProjectGridRow | null>(row)
  useEffect(() => {
    savingRef.current = saving
  }, [saving])
  useEffect(() => {
    rowRef.current = row
  }, [row])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const { row: data, error: selErr } = await selectGridClient(projectId)
      if (selErr) {
        setRow(null)
        setError(mapGridSchemaError(selErr))
        return
      }

      if (!data) {
        const unit = workspaceUnit ?? "cm"
        const def = defaultGrid(projectId, unit)
        const { row: ins, error: insErr } = await insertGridClient(def)
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
      if (savingRef.current) return null
      if (gridRowSignature(nextRow) === gridRowSignature(rowRef.current)) {
        return rowRef.current
      }
      setSaving(true)
      setError("")
      try {
        const { row: data, error: upErr } = await upsertGridClient(nextRow)
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
    []
  )

  // Keep grid unit in sync with workspace unit (artboard is the source of truth).
  useEffect(() => {
    if (!row) return
    if (!workspaceUnit) return
    if (row.unit === workspaceUnit) return
    if (savingRef.current) return

    // Convert via µpx so 10 cm → 100 mm exactly (no float px roundtrip).
    let xPxU: bigint
    let yPxU: bigint
    let lwPxU: bigint
    try {
      xPxU = unitToPxUFixed(String(row.spacing_x_value), row.unit)
      yPxU = unitToPxUFixed(String(row.spacing_y_value), row.unit)
      lwPxU = unitToPxUFixed(String(row.line_width_value), row.unit)
    } catch {
      return
    }

    const next: ProjectGridRow = {
      ...row,
      unit: workspaceUnit,
      spacing_x_value: Number(pxUToUnitDisplayFixed(xPxU, workspaceUnit)),
      spacing_y_value: Number(pxUToUnitDisplayFixed(yPxU, workspaceUnit)),
      line_width_value: Number(pxUToUnitDisplayFixed(lwPxU, workspaceUnit)),
    }
    if (gridRowSignature(next) === gridRowSignature(row)) return
    void upsertGrid(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.unit, workspaceUnit])

  const value = useMemo<ProjectGridContextValue>(() => {
    const unit = row ? normalizeGridUnit((row as unknown as { unit?: unknown })?.unit) : null
    const spacingXPx =
      row && unit ? Number(unitToPxFixed(Number(row.spacing_x_value), unit as Unit)) : null
    const spacingYPx =
      row && unit ? Number(unitToPxFixed(Number(row.spacing_y_value), unit as Unit)) : null
    const lineWidthPx =
      row && unit ? Number(unitToPxFixed(Number(row.line_width_value), unit as Unit)) : null

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
  }, [error, loading, projectId, refresh, row, saving, upsertGrid])

  return <ProjectGridContext.Provider value={value}>{children}</ProjectGridContext.Provider>
}

export function useProjectGrid() {
  const ctx = useContext(ProjectGridContext)
  if (!ctx) throw new Error("useProjectGrid must be used within ProjectGridProvider")
  return ctx
}

