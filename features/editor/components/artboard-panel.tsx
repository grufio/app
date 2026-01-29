"use client"

/**
 * Artboard settings panel.
 *
 * Responsibilities:
 * - Edit workspace unit, DPI, and artboard dimensions.
 * - Persist changes via `project_workspace` providers.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowLeftRight, ArrowUpDown, Gauge, Link2, Ruler, Unlink2 } from "lucide-react"

import { clampPx, fmt2, pxUToPxNumber, pxUToUnitDisplay, type Unit, unitToPxU } from "@/lib/editor/units"
import { parseNumericInput } from "@/lib/editor/numeric"
import { Button } from "@/components/ui/button"
import { SelectItem } from "@/components/ui/select"
import { IconNumericField } from "./fields/icon-numeric-field"
import { IconSelectField } from "./fields/icon-select-field"
import { PanelIconSlot, PanelTwoFieldRow } from "./panel-layout"
import { type WorkspaceRow, useProjectWorkspace } from "@/lib/editor/project-workspace"
import { computeArtboardSizeDisplay } from "@/services/editor/artboard-display"

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
  const { row, loading, saving, upsertWorkspace, widthPxU, heightPxU } = useProjectWorkspace()

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

  const draftDpi = row && draftDpiState.projectId === activeProjectId ? draftDpiState.value : row ? String(row.dpi_x) : ""
  const draftUnit =
    row && draftUnitState.projectId === activeProjectId
      ? draftUnitState.value
      : row
        ? normalizeUnit((row as unknown as { unit?: unknown })?.unit)
        : "mm"

  const dpiForDisplay = Number(draftDpi) || Number(row?.dpi_x) || 300
  const computedDisplay =
    row && widthPxU && heightPxU ? computeArtboardSizeDisplay({ widthPxU, heightPxU, unit: draftUnit, dpi: dpiForDisplay }) : null
  const computedWidth = computedDisplay ? computedDisplay.width : row ? String(row.width_value) : ""
  const computedHeight = computedDisplay ? computedDisplay.height : row ? String(row.height_value) : ""

  const draftWidth = row && draftWidthState.projectId === activeProjectId ? draftWidthState.value : computedWidth
  const draftHeight = row && draftHeightState.projectId === activeProjectId ? draftHeightState.value : computedHeight
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
      value:
        typeof updater === "function"
          ? (updater as (p: boolean) => boolean)(prev.projectId === activeProjectId ? prev.value : false)
          : updater,
    }))

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

  // Canonical size for conversions is µpx (BigInt), not integer px.
  const canonicalW = widthPxU
  const canonicalH = heightPxU

  const saveSize = useCallback(async () => {
    if (!row) return
    if (saving) return
    if (!canonicalW || !canonicalH) return

    const dpi = Number(draftDpi) || Number(row.dpi_x) || 300
    if (!Number.isFinite(dpi) || dpi <= 0) return

    const wStr = String(draftWidth).trim()
    const hStr = String(draftHeight).trim()
    if (!wStr || !hStr) return

    let nextWPxU: bigint
    let nextHPxU: bigint
    try {
      nextWPxU = unitToPxU(wStr, draftUnit, dpi)
      nextHPxU = unitToPxU(hStr, draftUnit, dpi)
    } catch {
      return
    }

    const signature = `${row.project_id}:${draftUnit}:${nextWPxU}:${nextHPxU}:${dpi}:${row.raster_effects_preset ?? ""}`
    if (lastSubmitRef.current === signature) return
    lastSubmitRef.current = signature

    const width_px_u = nextWPxU.toString()
    const height_px_u = nextHPxU.toString()
    const width_px = clampPx(pxUToPxNumber(nextWPxU))
    const height_px = clampPx(pxUToPxNumber(nextHPxU))

    const nextRow: WorkspaceRow = {
      ...row,
      unit: draftUnit,
      dpi_x: dpi,
      dpi_y: dpi,
      width_value: Number(wStr),
      height_value: Number(hStr),
      width_px_u,
      height_px_u,
      width_px,
      height_px,
      raster_effects_preset: presetFromDpi(dpi),
    }

    const saved = await upsertWorkspace(nextRow)
    if (!saved) {
      lastSubmitRef.current = null
      return
    }

    // Reset drafts to canonical display (prevents oscillation).
    const unitNormalized = normalizeUnit((saved as unknown as { unit?: unknown })?.unit)
    const savedDpi = Number(saved.dpi_x) || dpi
    const wU = BigInt(saved.width_px_u)
    const hU = BigInt(saved.height_px_u)
    setDraftWidthState({ projectId: activeProjectId, value: pxUToUnitDisplay(wU, unitNormalized, savedDpi) })
    setDraftHeightState({ projectId: activeProjectId, value: pxUToUnitDisplay(hU, unitNormalized, savedDpi) })
    setDraftDpiState({ projectId: activeProjectId, value: String(savedDpi) })
    setDraftUnitState({ projectId: activeProjectId, value: unitNormalized })
    setDraftRasterPresetState({
      projectId: activeProjectId,
      value: (saved.raster_effects_preset ?? presetFromDpi(savedDpi) ?? "custom") as "high" | "medium" | "low" | "custom",
    })
  }, [activeProjectId, canonicalH, canonicalW, draftDpi, draftHeight, draftUnit, draftWidth, row, saving, upsertWorkspace])

  const saveUnitOnly = useCallback(
    async (nextUnit: Unit) => {
      if (!row) return
      if (saving) return
      const saved = await upsertWorkspace({ ...row, unit: nextUnit })
      if (!saved) return
      setDraftUnitState({ projectId: activeProjectId, value: nextUnit })
    },
    [activeProjectId, row, saving, upsertWorkspace]
  )

  const onUnitChange = (nextUnit: Unit) => {
    if (loading || saving) return
    if (!canonicalW || !canonicalH) return
    if (unitChangeInFlightRef.current === nextUnit) return
    if (nextUnit === draftUnitRef.current) return
    unitChangeInFlightRef.current = nextUnit

    const dpi = Number(draftDpi) || Number(row?.dpi_x) || 300
    draftUnitRef.current = nextUnit
    setDraftUnit(nextUnit)

    // Display-only: canonical µpx stays unchanged.
    const display = computeArtboardSizeDisplay({ widthPxU: canonicalW, heightPxU: canonicalH, unit: nextUnit, dpi })
    setDraftWidth(display?.width ?? "")
    setDraftHeight(display?.height ?? "")

    setTimeout(() => {
      void saveUnitOnly(nextUnit)
      unitChangeInFlightRef.current = null
    }, 0)
  }

  const onRasterPresetChange = (next: string) => {
    if (!row) return
    if (loading || saving) return
    if (next === "custom") return
    const preset = next === "high" || next === "medium" || next === "low" ? next : "high"
    const dpi = preset === "high" ? 300 : preset === "medium" ? 150 : 72
    setDraftRasterPreset(preset)
    setDraftDpi(String(dpi))

    // DPI is display metadata; do not change canonical µpx size.
    setTimeout(() => {
      void upsertWorkspace({
        ...row,
        dpi_x: dpi,
        dpi_y: dpi,
        raster_effects_preset: preset,
      })
    }, 0)
  }

  const controlsDisabled = loading || !row || saving || !canonicalW || !canonicalH
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
        <IconNumericField
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
          mode="float"
          ariaLabel="Artboard width"
          disabled={controlsDisabled}
          icon={<ArrowLeftRight aria-hidden="true" />}
          numericProps={{
            id: "artboard-width",
            onKeyDown: (e) => {
              if (e.key === "Enter") void saveSize()
            },
            onBlur: () => {
              if (ignoreNextBlurSaveRef.current) {
                ignoreNextBlurSaveRef.current = false
                return
              }
              void saveSize()
            },
          }}
        />

        <IconNumericField
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
          mode="float"
          ariaLabel="Artboard height"
          disabled={controlsDisabled}
          icon={<ArrowUpDown aria-hidden="true" />}
          numericProps={{
            id: "artboard-height",
            onKeyDown: (e) => {
              if (e.key === "Enter") void saveSize()
            },
            onBlur: () => {
              if (ignoreNextBlurSaveRef.current) {
                ignoreNextBlurSaveRef.current = false
                return
              }
              void saveSize()
            },
          }}
        />

        <PanelIconSlot>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={lockAspect ? "Unlock proportional scaling" : "Lock proportional scaling"}
            aria-pressed={lockAspect}
            disabled={controlsDisabled}
            className={
              lockAspect ? "bg-black text-white hover:bg-black/90 hover:text-white" : "!bg-muted text-foreground hover:!bg-muted-foreground/10"
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
        <IconSelectField
          value={draftRasterPreset}
          onValueChange={(v) => onRasterPresetChange(v)}
          ariaLabel="Raster effects resolution"
          disabled={controlsDisabled}
          icon={<Gauge aria-hidden="true" />}
          triggerOnPointerDownCapture={() => {
            ignoreNextBlurSaveRef.current = true
          }}
        >
          <SelectItem value="high">{labelForPreset("high")}</SelectItem>
          <SelectItem value="medium">{labelForPreset("medium")}</SelectItem>
          <SelectItem value="low">{labelForPreset("low")}</SelectItem>
          {draftRasterPreset === "custom" ? <SelectItem value="custom">{`Custom (${draftDpi || "?"} ppi)`}</SelectItem> : null}
        </IconSelectField>

        <IconSelectField
          value={draftUnit}
          onValueChange={(v) => onUnitChange(v as Unit)}
          ariaLabel="Artboard unit"
          disabled={controlsDisabled}
          icon={<Ruler aria-hidden="true" />}
          triggerOnPointerDownCapture={() => {
            ignoreNextBlurSaveRef.current = true
          }}
        >
          <SelectItem value="mm">mm</SelectItem>
          <SelectItem value="cm">cm</SelectItem>
          <SelectItem value="pt">pt</SelectItem>
          <SelectItem value="px">px</SelectItem>
        </IconSelectField>

        <PanelIconSlot />
      </PanelTwoFieldRow>
    </div>
  )
}

