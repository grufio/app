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
import { pxFromPxU } from "@/services/editor/workspace-operations"
import {
  insertWorkspaceClient,
  selectWorkspaceClient,
  updateWorkspaceDpiClient,
  updateWorkspaceGeometryClient,
  updateWorkspacePageBgClient,
} from "@/services/editor/workspace/client"
import { createSerialWriteChannel } from "@/lib/utils/serial-write-channel"

export type WorkspaceRow = import("@/services/editor").WorkspaceRow
const MIN_WORKSPACE_PX_U = 1_000_000n
const MAX_WORKSPACE_PX_U = 32_768_000_000n

function parsePxUOrNull(raw: unknown): bigint | null {
  if (typeof raw !== "string") return null
  try {
    const parsed = BigInt(raw)
    if (parsed < MIN_WORKSPACE_PX_U || parsed > MAX_WORKSPACE_PX_U) return null
    return parsed
  } catch {
    return null
  }
}

function mapWorkspacePersistError(raw: string | null | undefined): string {
  const msg = String(raw ?? "").toLowerCase()
  if (!msg) return "Failed to save workspace"
  if (msg.includes("project_workspace_width_px_u_positive") || msg.includes("project_workspace_height_px_u_positive")) {
    return "Artboard size is out of supported range."
  }
  if (msg.includes("project_workspace_px_cache_consistency")) {
    return "Workspace size payload was inconsistent. Please try again."
  }
  if (msg.includes("requires width_px_u and height_px_u")) {
    return "Canonical artboard size is missing (width_px_u/height_px_u)."
  }
  return raw ?? "Failed to save workspace"
}

type WorkspaceContextValue = {
  projectId: string
  row: WorkspaceRow | null
  loading: boolean
  saving: boolean
  error: string
  refresh: () => Promise<void>
  updateWorkspaceDpi: (args: {
    outputDpi: number
    rasterEffectsPreset: WorkspaceRow["raster_effects_preset"]
  }) => Promise<WorkspaceRow | null>
  updateWorkspaceGeometry: (args: {
    unit: WorkspaceRow["unit"]
    widthValue: number
    heightValue: number
    widthPxU: string
    heightPxU: string
    widthPx: number
    heightPx: number
  }) => Promise<WorkspaceRow | null>
  updateWorkspacePageBg: (args: { enabled: boolean; color: string; opacity: number }) => Promise<WorkspaceRow | null>
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
  const logPrefix = useMemo(() => `[workspace:${projectId}]`, [projectId])
  const rowRef = useRef<WorkspaceRow | null>(row)
  const writeChannelRef = useRef(createSerialWriteChannel())
  useEffect(() => {
    rowRef.current = row
  }, [row])

  useEffect(() => {
    if (!row) return
    const widthOk = parsePxUOrNull((row as unknown as { width_px_u?: unknown }).width_px_u)
    const heightOk = parsePxUOrNull((row as unknown as { height_px_u?: unknown }).height_px_u)
    if (widthOk && heightOk) return
    console.error("[workspace] invalid canonical µpx detected", {
      projectId: row.project_id,
      width_px_u: (row as unknown as { width_px_u?: unknown }).width_px_u,
      height_px_u: (row as unknown as { height_px_u?: unknown }).height_px_u,
    })
    setError((prev) => (prev === "Invalid canonical workspace size (µpx)." ? prev : "Invalid canonical workspace size (µpx)."))
  }, [row])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const { row: data, error: selErr } = await selectWorkspaceClient(projectId)
      if (selErr) {
        console.warn(`${logPrefix} load failed`, { stage: "select", error: selErr })
        setRow(null)
        setError(selErr)
        return
      }

      if (!data) {
        const def = defaultWorkspace(projectId)
        const { row: ins, error: insErr } = await insertWorkspaceClient(def)
        if (insErr || !ins) {
          console.warn(`${logPrefix} default insert failed`, { stage: "insert", error: insErr })
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
  }, [logPrefix, projectId])

  const updateWorkspaceDpi = useCallback(
    async (args: {
      outputDpi: number
      rasterEffectsPreset: WorkspaceRow["raster_effects_preset"]
    }): Promise<WorkspaceRow | null> => {
      if (!rowRef.current?.project_id) return null
      return writeChannelRef.current.enqueueLatestDropStale(async (isStale) => {
        setSaving(true)
        setError("")
        try {
          const { row: data, error: upErr } = await updateWorkspaceDpiClient({
            projectId: rowRef.current!.project_id,
            outputDpi: args.outputDpi,
            rasterEffectsPreset: args.rasterEffectsPreset,
          })
          if (upErr || !data) {
            if (!isStale()) console.warn(`${logPrefix} save failed`, { op: "dpi", error: upErr })
            if (!isStale()) setError(mapWorkspacePersistError(upErr))
            return null
          }
          const normalized = normalizeWorkspaceRow(data)
          if (!isStale()) setRow(normalized)
          return normalized as unknown as WorkspaceRow
        } finally {
          setSaving(false)
        }
      })
    },
    [logPrefix]
  )

  const updateWorkspaceGeometry = useCallback(
    async (args: {
      unit: WorkspaceRow["unit"]
      widthValue: number
      heightValue: number
      widthPxU: string
      heightPxU: string
      widthPx: number
      heightPx: number
    }): Promise<WorkspaceRow | null> => {
      if (!rowRef.current?.project_id) return null
      return writeChannelRef.current.enqueueLatestDropStale(async (isStale) => {
        setSaving(true)
        setError("")
        try {
          const widthPxU = parsePxUOrNull(args.widthPxU)
          const heightPxU = parsePxUOrNull(args.heightPxU)
          if (!widthPxU || !heightPxU) {
            if (!isStale()) console.warn(`${logPrefix} save rejected`, { op: "geometry", reason: "invalid_px_u", widthPxU: args.widthPxU, heightPxU: args.heightPxU })
            if (!isStale()) setError("Artboard size is out of supported range.")
            return null
          }
          const derivedWidthPx = Math.max(1, pxFromPxU(widthPxU))
          const derivedHeightPx = Math.max(1, pxFromPxU(heightPxU))
          if (derivedWidthPx !== args.widthPx || derivedHeightPx !== args.heightPx) {
            if (!isStale())
              console.warn(`${logPrefix} save rejected`, {
                op: "geometry",
                reason: "px_cache_mismatch",
                expected: { widthPx: derivedWidthPx, heightPx: derivedHeightPx },
                got: { widthPx: args.widthPx, heightPx: args.heightPx },
              })
            if (!isStale()) setError("Workspace size payload was inconsistent. Please try again.")
            return null
          }
          const { row: data, error: upErr } = await updateWorkspaceGeometryClient({
            projectId: rowRef.current!.project_id,
            unit: args.unit,
            widthValue: args.widthValue,
            heightValue: args.heightValue,
            widthPxU: widthPxU.toString(),
            heightPxU: heightPxU.toString(),
            widthPx: derivedWidthPx,
            heightPx: derivedHeightPx,
          })
          if (upErr || !data) {
            if (!isStale()) console.warn(`${logPrefix} save failed`, { op: "geometry", error: upErr })
            if (!isStale()) setError(mapWorkspacePersistError(upErr))
            return null
          }
          const normalized = normalizeWorkspaceRow(data)
          if (!isStale()) setRow(normalized)
          return normalized as unknown as WorkspaceRow
        } finally {
          setSaving(false)
        }
      })
    },
    [logPrefix]
  )

  const updateWorkspacePageBg = useCallback(
    async (args: { enabled: boolean; color: string; opacity: number }): Promise<WorkspaceRow | null> => {
      if (!rowRef.current?.project_id) return null
      return writeChannelRef.current.enqueueLatestDropStale(async (isStale) => {
        setSaving(true)
        setError("")
        try {
          const { row: data, error: upErr } = await updateWorkspacePageBgClient({
            projectId: rowRef.current!.project_id,
            enabled: args.enabled,
            color: args.color,
            opacity: args.opacity,
          })
          if (upErr || !data) {
            if (!isStale()) console.warn(`${logPrefix} save failed`, { op: "page_bg", error: upErr })
            if (!isStale()) setError(mapWorkspacePersistError(upErr))
            return null
          }
          const normalized = normalizeWorkspaceRow(data)
          if (!isStale()) setRow(normalized)
          return normalized as unknown as WorkspaceRow
        } finally {
          setSaving(false)
        }
      })
    },
    [logPrefix]
  )

  useEffect(() => {
    // If server provided initial data, don't refetch on mount.
    if (initialRow?.project_id === projectId) return
    void refresh()
  }, [initialRow?.project_id, projectId, refresh])

  const value = useMemo<WorkspaceContextValue>(() => {
    // `row` is normalized when stored; avoid re-normalizing on every render.
    const unit = row ? (row as unknown as { unit?: Unit }).unit ?? null : null
    const dpiRaw = row != null ? (row as unknown as { output_dpi?: unknown }).output_dpi : null
    const dpi = dpiRaw != null && Number.isFinite(Number(dpiRaw)) ? Number(dpiRaw) : null
    const widthPxU = row ? parsePxUOrNull((row as unknown as { width_px_u?: unknown }).width_px_u) : null
    const heightPxU = row ? parsePxUOrNull((row as unknown as { height_px_u?: unknown }).height_px_u) : null
    const widthPx = row && Number.isFinite(Number(row.width_px)) ? Number(row.width_px) : null
    const heightPx = row && Number.isFinite(Number(row.height_px)) ? Number(row.height_px) : null
    return {
      projectId,
      row,
      loading,
      saving,
      error,
      refresh,
      updateWorkspaceDpi,
      updateWorkspaceGeometry,
      updateWorkspacePageBg,
      unit,
      dpi,
      widthPxU,
      heightPxU,
      widthPx,
      heightPx,
    }
  }, [error, loading, projectId, refresh, row, saving, updateWorkspaceDpi, updateWorkspaceGeometry, updateWorkspacePageBg])

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useProjectWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error("useProjectWorkspace must be used within ProjectWorkspaceProvider")
  return ctx
}

