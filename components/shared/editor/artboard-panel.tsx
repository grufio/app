"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowLeftRight, ArrowUpDown, Gauge, Link2, Ruler, Unlink2 } from "lucide-react"

import { clampPx, fmt2, pxToUnit, type Unit, unitToPx } from "@/lib/editor/units"
import { parseNumericInput } from "@/lib/editor/numeric"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { NumericInput } from "@/components/shared/editor/numeric-input"
import { PanelIconSlot, PanelTwoFieldRow } from "@/components/shared/editor/panel-layout"
import { type WorkspaceRow, useProjectWorkspace } from "@/lib/editor/project-workspace"

function normalizeUnit(u: unknown): Unit {
  if (u === "mm" || u === "cm" || u === "pt" || u === "px") return u
  return "cm"
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

/**
 * Artboard panel (workspace settings).
 *
 * Persists to `project_workspace` and reports:
 * - pixel size to the canvas (artboard rect)
 * - unit + dpi to other panels (e.g. image sizing panel)
 */
export function ArtboardPanel() {
  const { row, loading, saving, upsertWorkspace } = useProjectWorkspace()

  type Keyed<T> = { projectId: string | null; value: T }
  const activeProjectId = row?.project_id ?? null

  const [draftWidthState, setDraftWidthState] = useState<Keyed<string>>({ projectId: null, value: "" })
  const [draftHeightState, setDraftHeightState] = useState<Keyed<string>>({ projectId: null, value: "" })
  const [draftDpiState, setDraftDpiState] = useState<Keyed<string>>({ projectId: null, value: "" })
  const [draftUnitState, setDraftUnitState] = useState<Keyed<Unit>>({ projectId: null, value: "mm" })
  const [draftRasterPresetState, setDraftRasterPresetState] = useState<Keyed<"high" | "medium" | "low" | "custom">>({
    projectId: null,
    value: "high",
  })
  const [lockAspectState, setLockAspectState] = useState<Keyed<boolean>>({ projectId: null, value: false })

  const draftWidth =
    row && draftWidthState.projectId === activeProjectId ? draftWidthState.value : row ? String(row.width_value) : ""
  const draftHeight =
    row && draftHeightState.projectId === activeProjectId ? draftHeightState.value : row ? String(row.height_value) : ""
  const draftDpi = row && draftDpiState.projectId === activeProjectId ? draftDpiState.value : row ? String(row.dpi_x) : ""
  const draftUnit =
    row && draftUnitState.projectId === activeProjectId
      ? draftUnitState.value
      : row
        ? normalizeUnit((row as unknown as { unit?: unknown })?.unit)
        : "mm"
  const draftRasterPreset =
    row && draftRasterPresetState.projectId === activeProjectId
      ? draftRasterPresetState.value
      : row
        ? (row.raster_effects_preset ?? presetFromDpi(Number(row.dpi_x)) ?? "custom")
        : "high"
  const lockAspect = row && lockAspectState.projectId === activeProjectId ? lockAspectState.value : false

  const setDraftWidth = (next: string) => setDraftWidthState({ projectId: activeProjectId, value: next })
  const setDraftHeight = (next: string) => setDraftHeightState({ projectId: activeProjectId, value: next })
  const setDraftDpi = (next: string) => setDraftDpiState({ projectId: activeProjectId, value: next })
  const setDraftUnit = (next: Unit) => setDraftUnitState({ projectId: activeProjectId, value: next })
  const setDraftRasterPreset = (next: "high" | "medium" | "low" | "custom") =>
    setDraftRasterPresetState({ projectId: activeProjectId, value: next })
  const setLockAspect = (updater: boolean | ((prev: boolean) => boolean)) =>
    setLockAspectState((prev) => ({
      projectId: activeProjectId,
      value: typeof updater === "function" ? (updater as (p: boolean) => boolean)(prev.projectId === activeProjectId ? prev.value : false) : updater,
    }))

  // Intentionally no inline error UI in the panel (per product requirement).
  const [, setError] = useState("")

  const lastSubmitRef = useRef<string | null>(null)
  const ignoreNextBlurSaveRef = useRef(false)
  const draftUnitRef = useRef<Unit>("mm")
  const unitChangeInFlightRef = useRef<Unit | null>(null)
  const lockRatioRef = useRef<number | null>(null)

  useEffect(() => {
    draftUnitRef.current = draftUnit
  }, [draftUnit])

  useEffect(() => {
    // Reset lock ratio when switching projects (no setState to satisfy lint rule).
    lockRatioRef.current = null
  }, [activeProjectId])

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

      const saved = await upsertWorkspace(nextRow)
      if (!saved) {
        lastSubmitRef.current = null
        setError("Failed to save")
        return
      }

      const unitNormalized = normalizeUnit((saved as unknown as { unit?: unknown })?.unit)
      setDraftWidthState({ projectId: activeProjectId, value: String(saved.width_value) })
      setDraftHeightState({ projectId: activeProjectId, value: String(saved.height_value) })
      setDraftDpiState({ projectId: activeProjectId, value: String(saved.dpi_x) })
      setDraftUnitState({ projectId: activeProjectId, value: unitNormalized })
      setDraftRasterPresetState({
        projectId: activeProjectId,
        value: (saved.raster_effects_preset ?? presetFromDpi(Number(saved.dpi_x)) ?? "custom") as "high" | "medium" | "low" | "custom",
      })
    },
    [activeProjectId, row, saving, upsertWorkspace]
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

    // Convert via px using the shared deterministic unit math.
    const wPx = unitToPx(w, fromUnit, dpi)
    const hPx = unitToPx(h, fromUnit, dpi)
    const wNext = pxToUnit(wPx, nextUnit, dpi)
    const hNext = pxToUnit(hPx, nextUnit, dpi)

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
        <InputGroup>
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
          />
          <InputGroupAddon>
            <ArrowLeftRight aria-hidden="true" />
          </InputGroupAddon>
        </InputGroup>

        <InputGroup>
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
          />
          <InputGroupAddon>
            <ArrowUpDown aria-hidden="true" />
          </InputGroupAddon>
        </InputGroup>

        <PanelIconSlot>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={lockAspect ? "Unlock proportional scaling" : "Lock proportional scaling"}
            aria-pressed={lockAspect}
            disabled={controlsDisabled}
            className={
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
            {lockAspect ? <Link2 className="h-[16px] w-[16px]" /> : <Unlink2 className="h-[16px] w-[16px]" />}
          </Button>
        </PanelIconSlot>
      </PanelTwoFieldRow>

      <PanelTwoFieldRow>
        <InputGroup>
          <Select value={draftRasterPreset} onValueChange={(v) => onRasterPresetChange(v)}>
            <SelectTrigger
              className="flex-1 min-w-0 border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 overflow-hidden whitespace-nowrap"
              disabled={controlsDisabled}
              aria-label="Raster effects resolution"
              onPointerDownCapture={() => {
                ignoreNextBlurSaveRef.current = true
              }}
            >
              <SelectValue className="truncate" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="high">{labelForPreset("high")}</SelectItem>
              <SelectItem value="medium">{labelForPreset("medium")}</SelectItem>
              <SelectItem value="low">{labelForPreset("low")}</SelectItem>
              {draftRasterPreset === "custom" ? (
                <SelectItem value="custom">{`Custom (${draftDpi || "?"} ppi)`}</SelectItem>
              ) : null}
            </SelectContent>
          </Select>
          <InputGroupAddon align="inline-start">
            <Gauge aria-hidden="true" />
          </InputGroupAddon>
        </InputGroup>

        <InputGroup>
          <Select value={draftUnit} onValueChange={(v) => onUnitChange(v as Unit)}>
            <SelectTrigger
              className="flex-1 min-w-0 border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 overflow-hidden whitespace-nowrap"
              disabled={controlsDisabled}
              aria-label="Artboard unit"
              onPointerDownCapture={() => {
                ignoreNextBlurSaveRef.current = true
              }}
            >
              <SelectValue className="truncate" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mm">mm</SelectItem>
              <SelectItem value="cm">cm</SelectItem>
              <SelectItem value="pt">pt</SelectItem>
              <SelectItem value="px">px</SelectItem>
            </SelectContent>
          </Select>
          <InputGroupAddon align="inline-start">
            <Ruler aria-hidden="true" />
          </InputGroupAddon>
        </InputGroup>

        <PanelIconSlot />
      </PanelTwoFieldRow>

    </div>
  )
}

