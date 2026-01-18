"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowLeftRight, ArrowUpDown, Gauge, Link2, Ruler, Unlink2 } from "lucide-react"

import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { clampPx, fmt2, type Unit, unitToPx } from "@/lib/editor/units"
import { parseNumericInput } from "@/lib/editor/numeric"
import { Button } from "@/components/ui/button"
import { NumericInput } from "@/components/shared/editor/numeric-input"
import { PanelField, PanelIconSlot, PanelTwoFieldRow } from "@/components/shared/editor/panel-layout"

export type WorkspaceRow = {
  project_id: string
  unit: Unit
  width_value: number
  height_value: number
  dpi_x: number
  dpi_y: number
  width_px: number
  height_px: number
  raster_effects_preset?: "high" | "medium" | "low" | null
}

function normalizeUnit(u: unknown): Unit {
  if (u === "mm" || u === "cm" || u === "pt" || u === "px") return u
  return "cm"
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
  // Default: 20x30cm @ 300dpi (Illustrator-like "new document")
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
    raster_effects_preset: "high",
    width_px: clampPx(unitToPx(width_value, unit, dpi_x)),
    height_px: clampPx(unitToPx(height_value, unit, dpi_y)),
  }
}

function presetFromDpi(dpi: number): "high" | "medium" | "low" | null {
  if (dpi === 300) return "high"
  if (dpi === 150) return "medium"
  if (dpi === 72) return "low"
  return null
}

function labelForPreset(p: "high" | "medium" | "low"): string {
  if (p === "high") return "High (300 ppi)"
  if (p === "medium") return "Medium (150 ppi)"
  return "Low (72 ppi)"
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
  const [draftRasterPreset, setDraftRasterPreset] = useState<"high" | "medium" | "low" | "custom">("high")
  const [lockAspect, setLockAspect] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const lastSubmitRef = useRef<string | null>(null)
  const ignoreNextBlurSaveRef = useRef(false)
  const draftUnitRef = useRef<Unit>("mm")
  const unitChangeInFlightRef = useRef<Unit | null>(null)
  const lockRatioRef = useRef<number | null>(null)
  const onChangePxRef = useRef<Props["onChangePx"]>(onChangePx)
  const onChangeMetaRef = useRef<Props["onChangeMeta"]>(onChangeMeta)

  useEffect(() => {
    draftUnitRef.current = draftUnit
  }, [draftUnit])

  useEffect(() => {
    onChangePxRef.current = onChangePx
  }, [onChangePx])

  useEffect(() => {
    onChangeMetaRef.current = onChangeMeta
  }, [onChangeMeta])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError("")
      try {
        const supabase = createSupabaseBrowserClient()
        const { data, error: selErr } = await supabase
          .from("project_workspace")
          .select("project_id,unit,width_value,height_value,dpi_x,dpi_y,width_px,height_px,raster_effects_preset")
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
            .select("project_id,unit,width_value,height_value,dpi_x,dpi_y,width_px,height_px,raster_effects_preset")
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
          setDraftUnit(normalizeUnit((ins as WorkspaceRow).unit))
          setDraftRasterPreset(
            (ins as WorkspaceRow).raster_effects_preset ??
              presetFromDpi(Number((ins as WorkspaceRow).dpi_x)) ??
              "custom"
          )
          onChangePxRef.current?.(Number(ins.width_px), Number(ins.height_px))
          onChangeMetaRef.current?.(normalizeUnit((ins as WorkspaceRow).unit), Number(ins.dpi_x))
          return
        }

        const r = data as unknown as WorkspaceRow
        setRow(r)
        const unit = normalizeUnit((r as unknown as { unit?: unknown })?.unit)
        setDraftWidth(String(r.width_value))
        setDraftHeight(String(r.height_value))
        setDraftDpi(String(r.dpi_x))
        setDraftUnit(unit)
        setDraftRasterPreset(r.raster_effects_preset ?? presetFromDpi(Number(r.dpi_x)) ?? "custom")
        // Reset lock to avoid surprising behavior when switching projects.
        setLockAspect(false)
        lockRatioRef.current = null
        onChangePxRef.current?.(Number(r.width_px), Number(r.height_px))
        onChangeMetaRef.current?.(unit, Number(r.dpi_x))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [projectId])

  const saveWith = useCallback(
    async (next: { width: number; height: number; dpi: number; unit: Unit; rasterPreset: "high" | "medium" | "low" | null }) => {
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

      // DB constraint `workspace_px_consistency`:
      // if unit is px, width_value/height_value must EXACTLY match width_px/height_px.
      // So for `px` we always round once and store the same integers in both places.
      const widthPx = unit === "px" ? clampPx(w) : clampPx(unitToPx(w, unit, dpi))
      const heightPx = unit === "px" ? clampPx(h) : clampPx(unitToPx(h, unit, dpi))

      const nextRow: WorkspaceRow = {
        ...row,
        unit,
        width_value: unit === "px" ? widthPx : w,
        height_value: unit === "px" ? heightPx : h,
        dpi_x: dpi,
        dpi_y: dpi,
        raster_effects_preset: next.rasterPreset,
        width_px: widthPx,
        height_px: heightPx,
      }

      setSaving(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data, error: upErr } = await supabase
          .from("project_workspace")
          .upsert(nextRow, { onConflict: "project_id" })
          .select("project_id,unit,width_value,height_value,dpi_x,dpi_y,width_px,height_px,raster_effects_preset")
          .single()

        if (upErr || !data) {
          lastSubmitRef.current = null
          setError(upErr?.message ?? "Failed to save")
          return
        }

        const r = data as unknown as WorkspaceRow
        setRow(r)
        const unit = normalizeUnit((r as unknown as { unit?: unknown })?.unit)
        setDraftWidth(String(r.width_value))
        setDraftHeight(String(r.height_value))
        setDraftDpi(String(r.dpi_x))
        setDraftUnit(unit)
        setDraftRasterPreset(r.raster_effects_preset ?? presetFromDpi(Number(r.dpi_x)) ?? "custom")
        onChangePxRef.current?.(Number(r.width_px), Number(r.height_px))
        onChangeMetaRef.current?.(unit, Number(r.dpi_x))
      } finally {
        setSaving(false)
      }
    },
    [row, saving]
  )

  const save = useCallback(async () => {
    if (!row) return
    if (saving) return
    const w = Number(draftWidth)
    const h = Number(draftHeight)
    const dpi = Number(draftDpi)
    await saveWith({ width: w, height: h, dpi, unit: draftUnit, rasterPreset: presetFromDpi(dpi) })
  }, [draftDpi, draftHeight, draftUnit, draftWidth, row, saveWith, saving])

  const onUnitChange = (nextUnit: Unit) => {
    if (loading || saving) return
    if (unitChangeInFlightRef.current === nextUnit) return
    if (nextUnit === draftUnitRef.current) return
    unitChangeInFlightRef.current = nextUnit
    const dpi = Number(draftDpi) || (row?.dpi_x ?? 300)
    const fromUnit = draftUnitRef.current
    draftUnitRef.current = nextUnit
    setDraftUnit(nextUnit)

    const w = Number(draftWidth)
    const h = Number(draftHeight)
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
      unitChangeInFlightRef.current = null
      return
    }

    const wIn = toInches(w, fromUnit, dpi)
    const hIn = toInches(h, fromUnit, dpi)
    const wNext = fromInches(wIn, nextUnit, dpi)
    const hNext = fromInches(hIn, nextUnit, dpi)

    const nextWidth = nextUnit === "px" ? String(clampPx(wNext)) : fmt2(wNext)
    const nextHeight = nextUnit === "px" ? String(clampPx(hNext)) : fmt2(hNext)
    setDraftWidth(nextWidth)
    setDraftHeight(nextHeight)

    setTimeout(() => {
      void saveWith({ width: Number(nextWidth), height: Number(nextHeight), dpi, unit: nextUnit, rasterPreset: presetFromDpi(dpi) })
      unitChangeInFlightRef.current = null
    }, 0)
  }

  const onRasterPresetChange = (next: string) => {
    if (loading || saving) return
    if (next === "custom") return
    const preset = next === "high" || next === "medium" || next === "low" ? next : "high"
    const dpi = preset === "high" ? 300 : preset === "medium" ? 150 : 72
    setDraftRasterPreset(preset)
    setDraftDpi(String(dpi))
    setTimeout(() => {
      void saveWith({
        width: Number(draftWidth),
        height: Number(draftHeight),
        dpi,
        unit: draftUnitRef.current,
        rasterPreset: preset,
      })
    }, 0)
  }

  const controlsDisabled = loading || !row || saving
  const ratio = lockRatioRef.current
  const ensureRatio = () => {
    const w = parseNumericInput(draftWidth)
    const h = parseNumericInput(draftHeight)
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null
    return w / h
  }

  return (
    <div className="space-y-4">
      {/* Rows follow a consistent layout:
          [field | field | icon-slot] so the UI stays aligned across rows. */}
      <PanelTwoFieldRow>
        <PanelField icon={<ArrowLeftRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}>
          <NumericInput
            id="artboard-width"
            value={draftWidth}
            onValueChange={(next) => {
              setDraftWidth(next)
              if (!lockAspect) return
              const r = ratio ?? ensureRatio()
              if (!r) return
              lockRatioRef.current = r
              const w = parseNumericInput(next)
              if (!Number.isFinite(w) || w <= 0) return
              setDraftHeight(fmt2(w / r))
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save()
            }}
            onBlur={() => {
              if (ignoreNextBlurSaveRef.current) {
                ignoreNextBlurSaveRef.current = false
                return
              }
              void save()
            }}
            disabled={controlsDisabled}
            aria-label="Artboard width"
            className="h-6 w-full px-2 py-0 text-[12px] md:text-[12px] shadow-none"
          />
        </PanelField>

        <PanelField icon={<ArrowUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}>
          <NumericInput
            id="artboard-height"
            value={draftHeight}
            onValueChange={(next) => {
              setDraftHeight(next)
              if (!lockAspect) return
              const r = ratio ?? ensureRatio()
              if (!r) return
              lockRatioRef.current = r
              const h = parseNumericInput(next)
              if (!Number.isFinite(h) || h <= 0) return
              setDraftWidth(fmt2(h * r))
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save()
            }}
            onBlur={() => {
              if (ignoreNextBlurSaveRef.current) {
                ignoreNextBlurSaveRef.current = false
                return
              }
              void save()
            }}
            disabled={controlsDisabled}
            aria-label="Artboard height"
            className="h-6 w-full px-2 py-0 text-[12px] md:text-[12px] shadow-none"
          />
        </PanelField>

        <PanelIconSlot>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={lockAspect ? "Unlock proportional scaling" : "Lock proportional scaling"}
            aria-pressed={lockAspect}
            disabled={controlsDisabled}
            className={
              "h-6 w-6 " +
              (lockAspect
                ? "bg-black text-white hover:bg-black/90 hover:text-white"
                : "!bg-muted text-foreground hover:!bg-muted-foreground/10")
            }
            onPointerDownCapture={() => {
              // Avoid blur-autosave firing when clicking the lock button.
              ignoreNextBlurSaveRef.current = true
            }}
            onClick={() => {
              setLockAspect((prev) => {
                const next = !prev
                lockRatioRef.current = next ? ensureRatio() : null
                return next
              })
            }}
          >
            {lockAspect ? <Link2 className="size-4" /> : <Unlink2 className="size-4" />}
          </Button>
        </PanelIconSlot>
      </PanelTwoFieldRow>

      <PanelTwoFieldRow>
        <PanelField icon={<Gauge className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}>
          <select
            value={draftRasterPreset}
            disabled={controlsDisabled}
            aria-label="Raster effects resolution"
            className="border-input bg-transparent text-foreground flex h-6 w-full items-center justify-between rounded-md border px-2 py-0 text-[12px] md:text-[12px] shadow-none outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            onMouseDown={() => {
              // Prevent blur-autosave from a focused input when opening the dropdown.
              ignoreNextBlurSaveRef.current = true
            }}
            onChange={(e) => onRasterPresetChange(e.target.value)}
          >
            <option value="high">{labelForPreset("high")}</option>
            <option value="medium">{labelForPreset("medium")}</option>
            <option value="low">{labelForPreset("low")}</option>
            {draftRasterPreset === "custom" ? (
              <option value="custom">{`Custom (${draftDpi || "?"} ppi)`}</option>
            ) : null}
          </select>
        </PanelField>

        <PanelField icon={<Ruler className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}>
          <select
            value={draftUnit}
            disabled={controlsDisabled}
            aria-label="Artboard unit"
            className="border-input bg-transparent text-foreground flex h-6 w-full items-center justify-between rounded-md border px-2 py-0 text-[12px] md:text-[12px] shadow-none outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            onMouseDown={() => {
              ignoreNextBlurSaveRef.current = true
            }}
            onChange={(e) => onUnitChange(e.target.value as Unit)}
          >
            <option value="mm">mm</option>
            <option value="cm">cm</option>
            <option value="pt">pt</option>
            <option value="px">px</option>
          </select>
        </PanelField>

        <PanelIconSlot />
      </PanelTwoFieldRow>

      {saving ? <div className="text-[12px] md:text-[12px] text-muted-foreground">Saving…</div> : null}
      {error ? <div className="text-[12px] md:text-[12px] text-destructive">{error}</div> : null}
    </div>
  )
}

