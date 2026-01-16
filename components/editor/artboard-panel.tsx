"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowLeftRight, ArrowUpDown, Gauge, Ruler } from "lucide-react"

import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { clampPx, fmt2, type Unit, unitToPx } from "@/lib/editor/units"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export type WorkspaceRow = {
  project_id: string
  unit: Unit
  width_value: number
  height_value: number
  dpi_x: number
  dpi_y: number
  width_px: number
  height_px: number
}

function toInches(value: number, unit: Unit, dpi: number): number {
  if (unit === "mm") return value / 25.4
  if (unit === "cm") return value / 2.54
  if (unit === "pt") return value / 72
  if (unit === "px") return value / dpi
  return value / 25.4
}

function fromInches(inches: number, unit: Unit, dpi: number): number {
  if (unit === "mm") return inches * 25.4
  if (unit === "cm") return inches * 2.54
  if (unit === "pt") return inches * 72
  if (unit === "px") return inches * dpi
  return inches * 25.4
}

function defaultWorkspace(projectId: string): WorkspaceRow {
  // MVP default: 20x30cm @ 300dpi
  const unit: Unit = "cm"
  const width_value = 20
  const height_value = 30
  const dpi_x = 300
  const dpi_y = 300
  return {
    project_id: projectId,
    unit,
    width_value,
    height_value,
    dpi_x,
    dpi_y,
    width_px: clampPx(unitToPx(width_value, unit, dpi_x)),
    height_px: clampPx(unitToPx(height_value, unit, dpi_y)),
  }
}

type Props = {
  projectId: string
  onChangePx?: (widthPx: number, heightPx: number) => void
  onChangeMeta?: (unit: Unit, dpi: number) => void
}

/**
 * Artboard panel (workspace settings).
 *
 * Persists to `project_workspace` and reports:
 * - pixel size to the canvas (artboard rect)
 * - unit + dpi to other panels (e.g. image sizing panel)
 */
export function ArtboardPanel({ projectId, onChangePx, onChangeMeta }: Props) {
  const [row, setRow] = useState<WorkspaceRow | null>(null)
  const [draftWidth, setDraftWidth] = useState("")
  const [draftHeight, setDraftHeight] = useState("")
  const [draftDpi, setDraftDpi] = useState("")
  const [draftUnit, setDraftUnit] = useState<Unit>("mm")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const lastSubmitRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError("")
      try {
        const supabase = createSupabaseBrowserClient()
        const { data, error: selErr } = await supabase
          .from("project_workspace")
          .select("project_id,unit,width_value,height_value,dpi_x,dpi_y,width_px,height_px")
          .eq("project_id", projectId)
          .maybeSingle()

        if (cancelled) return
        if (selErr) {
          setError(selErr.message)
          setRow(null)
          return
        }

        if (!data) {
          const def = defaultWorkspace(projectId)
          const { data: ins, error: insErr } = await supabase
            .from("project_workspace")
            .insert(def)
            .select("project_id,unit,width_value,height_value,dpi_x,dpi_y,width_px,height_px")
            .single()

          if (cancelled) return
          if (insErr || !ins) {
            setError(insErr?.message ?? "Failed to create default artboard")
            setRow(null)
            return
          }
          setRow(ins as WorkspaceRow)
          setDraftWidth(String(ins.width_value))
          setDraftHeight(String(ins.height_value))
          setDraftDpi(String(ins.dpi_x))
          setDraftUnit(ins.unit as Unit)
          onChangePx?.(Number(ins.width_px), Number(ins.height_px))
          onChangeMeta?.(ins.unit as Unit, Number(ins.dpi_x))
          return
        }

        const r = data as unknown as WorkspaceRow
        setRow(r)
        setDraftWidth(String(r.width_value))
        setDraftHeight(String(r.height_value))
        setDraftDpi(String(r.dpi_x))
        setDraftUnit(r.unit)
        onChangePx?.(Number(r.width_px), Number(r.height_px))
        onChangeMeta?.(r.unit, Number(r.dpi_x))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [onChangeMeta, onChangePx, projectId])

  const saveWith = useCallback(
    async (next: { width: number; height: number; dpi: number; unit: Unit }) => {
      if (!row) return
      if (saving) return

      setError("")

      const w = next.width
      const h = next.height
      const dpi = next.dpi
      const unit = next.unit

      if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) {
        setError("Please enter valid values > 0.")
        return
      }
      if (!Number.isFinite(dpi) || dpi <= 0) {
        setError("Please enter a valid DPI > 0.")
        return
      }

      const signature = `${row.project_id}:${unit}:${w}:${h}:${dpi}`
      if (lastSubmitRef.current === signature) return
      lastSubmitRef.current = signature

      const nextRow: WorkspaceRow = {
        ...row,
        unit,
        width_value: w,
        height_value: h,
        dpi_x: dpi,
        dpi_y: dpi,
        width_px: clampPx(unitToPx(w, unit, dpi)),
        height_px: clampPx(unitToPx(h, unit, dpi)),
      }

      setSaving(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data, error: upErr } = await supabase
          .from("project_workspace")
          .upsert(nextRow, { onConflict: "project_id" })
          .select("project_id,unit,width_value,height_value,dpi_x,dpi_y,width_px,height_px")
          .single()

        if (upErr || !data) {
          lastSubmitRef.current = null
          setError(upErr?.message ?? "Failed to save")
          return
        }

        const r = data as unknown as WorkspaceRow
        setRow(r)
        setDraftWidth(String(r.width_value))
        setDraftHeight(String(r.height_value))
        setDraftDpi(String(r.dpi_x))
        setDraftUnit(r.unit)
        onChangePx?.(Number(r.width_px), Number(r.height_px))
        onChangeMeta?.(r.unit, Number(r.dpi_x))
      } finally {
        setSaving(false)
      }
    },
    [onChangeMeta, onChangePx, row, saving]
  )

  const save = useCallback(async () => {
    if (!row) return
    if (saving) return
    const w = Number(draftWidth)
    const h = Number(draftHeight)
    const dpi = Number(draftDpi)
    await saveWith({ width: w, height: h, dpi, unit: draftUnit })
  }, [draftDpi, draftHeight, draftUnit, draftWidth, row, saveWith, saving])

  const onUnitChange = (nextUnit: Unit) => {
    const dpi = Number(draftDpi) || (row?.dpi_x ?? 300)
    const fromUnit = draftUnit
    setDraftUnit(nextUnit)

    const w = Number(draftWidth)
    const h = Number(draftHeight)
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return

    const wIn = toInches(w, fromUnit, dpi)
    const hIn = toInches(h, fromUnit, dpi)
    const wNext = fromInches(wIn, nextUnit, dpi)
    const hNext = fromInches(hIn, nextUnit, dpi)

    const nextWidth = fmt2(wNext)
    const nextHeight = fmt2(hNext)
    setDraftWidth(nextWidth)
    setDraftHeight(nextHeight)

    void saveWith({ width: Number(nextWidth), height: Number(nextHeight), dpi, unit: nextUnit })
  }

  const controlsDisabled = loading || !row || saving

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Input
            id="artboard-width"
            inputMode="decimal"
            value={draftWidth}
            onChange={(e) => setDraftWidth(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save()
            }}
            onBlur={() => void save()}
            disabled={controlsDisabled}
            aria-label="Artboard width"
            className="h-6 w-full px-2 py-0 text-[12px] md:text-[12px] shadow-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <ArrowUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Input
            id="artboard-height"
            inputMode="decimal"
            value={draftHeight}
            onChange={(e) => setDraftHeight(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save()
            }}
            onBlur={() => void save()}
            disabled={controlsDisabled}
            aria-label="Artboard height"
            className="h-6 w-full px-2 py-0 text-[12px] md:text-[12px] shadow-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2">
          <Gauge className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Input
            id="artboard-dpi"
            inputMode="decimal"
            value={draftDpi}
            onChange={(e) => setDraftDpi(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save()
            }}
            onBlur={() => void save()}
            disabled={controlsDisabled}
            aria-label="Artboard DPI"
            className="h-6 w-full px-2 py-0 text-[12px] md:text-[12px] shadow-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <Ruler className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Select value={draftUnit} onValueChange={(v) => onUnitChange(v as Unit)} disabled={controlsDisabled}>
            <SelectTrigger className="h-6 w-full px-2 py-0 text-[12px] md:text-[12px] shadow-none">
              <SelectValue aria-label="Artboard unit" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mm">mm</SelectItem>
              <SelectItem value="cm">cm</SelectItem>
              <SelectItem value="pt">pt</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {saving ? <div className="text-[12px] md:text-[12px] text-muted-foreground">Saving…</div> : null}
      {error ? <div className="text-[12px] md:text-[12px] text-destructive">{error}</div> : null}
    </div>
  )
}

