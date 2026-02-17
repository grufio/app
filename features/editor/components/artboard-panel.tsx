"use client"

/**
 * Artboard settings panel.
 *
 * Responsibilities:
 * - Edit workspace unit and artboard dimensions (geometry).
 * - Edit artboard DPI.
 * - Persist changes via `project_workspace` providers.
 */
import { useEffect, useRef } from "react"
import { ArrowLeftRight, ArrowUpDown, Gauge, Link2, Ruler, Unlink2 } from "lucide-react"

import { fmt2, pxUToUnitDisplay, type Unit } from "@/lib/editor/units"
import { parseNumericInput } from "@/lib/editor/numeric"
import { Button } from "@/components/ui/button"
import { SelectItem } from "@/components/ui/select"
import { IconNumericField } from "./fields/icon-numeric-field"
import { IconSelectField } from "./fields/icon-select-field"
import { PanelIconSlot, PanelTwoFieldRow } from "./panel-layout"
import { useProjectWorkspace } from "@/lib/editor/project-workspace"
import { computeArtboardSizeDisplay } from "@/services/editor/artboard-display"
import {
  computeLockedDimension,
  computeWorkspaceSizeSave,
  computeWorkspaceUnitChange,
  mapDpiToRasterPreset,
  normalizeUnit,
} from "@/services/editor/workspace-operations"
import { useKeyedDraft } from "@/lib/editor/use-keyed-draft"

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

  const activeProjectId = row?.project_id ?? null

  const computedUnit = row ? normalizeUnit((row as unknown as { unit?: unknown })?.unit) : "mm"
  const computedOutputDpi = row ? Number(row.artboard_dpi) : 300
  const computedPreset =
    row
      ? ((row.raster_effects_preset ?? mapDpiToRasterPreset(Number(row.artboard_dpi)) ?? "custom") as
          | "high"
          | "medium"
          | "low"
          | "custom")
      : "high"

  const { value: draftOutputDpi, setValue: setDraftOutputDpi } = useKeyedDraft(activeProjectId, String(computedOutputDpi))
  const { value: draftUnit, setValue: setDraftUnit } = useKeyedDraft<Unit>(activeProjectId, computedUnit)
  const { value: draftRasterPreset, setValue: setDraftRasterPreset } = useKeyedDraft<"high" | "medium" | "low" | "custom">(
    activeProjectId,
    computedPreset
  )
  const { value: lockAspect, setValue: setLockAspect } = useKeyedDraft<boolean>(activeProjectId, false)

  const computedDisplay =
    row && widthPxU && heightPxU
      ? computeArtboardSizeDisplay({ widthPxU, heightPxU, unit: draftUnit, dpi: Number(row.artboard_dpi) })
      : null
  const computedWidth = computedDisplay ? computedDisplay.width : row ? String(row.width_value) : ""
  const computedHeight = computedDisplay ? computedDisplay.height : row ? String(row.height_value) : ""

  const { value: draftWidth, setValue: setDraftWidth } = useKeyedDraft(activeProjectId, computedWidth)
  const { value: draftHeight, setValue: setDraftHeight } = useKeyedDraft(activeProjectId, computedHeight)

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

  const saveSize = async () => {
    if (!row) return
    if (saving) return
    if (!canonicalW || !canonicalH) return

    const computed = computeWorkspaceSizeSave({
      base: row,
      unit: draftUnit,
      draftW: draftWidth,
      draftH: draftHeight,
    })
    if ("error" in computed) return

    const signature = computed.signature
    if (lastSubmitRef.current === signature) return
    lastSubmitRef.current = signature

    const saved = await upsertWorkspace(computed.next)
    if (!saved) {
      lastSubmitRef.current = null
      return
    }

    // Reset drafts to canonical display (prevents oscillation).
    const unitNormalized = normalizeUnit((saved as unknown as { unit?: unknown })?.unit)
    const wU = BigInt(saved.width_px_u)
    const hU = BigInt(saved.height_px_u)
    const nextOutput = Number(saved.artboard_dpi) || computedOutputDpi
    setDraftWidth(pxUToUnitDisplay(wU, unitNormalized, nextOutput))
    setDraftHeight(pxUToUnitDisplay(hU, unitNormalized, nextOutput))
    setDraftUnit(unitNormalized)
    setDraftOutputDpi(String(nextOutput))
    setDraftRasterPreset((saved.raster_effects_preset ?? mapDpiToRasterPreset(nextOutput) ?? "custom") as "high" | "medium" | "low" | "custom")
  }

  const saveUnitOnly = async (nextUnit: Unit) => {
    if (!row) return
    if (saving) return
    const computed = computeWorkspaceUnitChange({ base: row, nextUnit })
    const saved = await upsertWorkspace(computed.next)
    if (!saved) return
    setDraftUnit(nextUnit)
  }

  const onUnitChange = (nextUnit: Unit) => {
    if (loading || saving) return
    if (!canonicalW || !canonicalH) return
    if (unitChangeInFlightRef.current === nextUnit) return
    if (nextUnit === draftUnitRef.current) return
    unitChangeInFlightRef.current = nextUnit

    draftUnitRef.current = nextUnit
    setDraftUnit(nextUnit)

    // Display-only: canonical µpx stays unchanged.
    const display = computeArtboardSizeDisplay({
      widthPxU: canonicalW,
      heightPxU: canonicalH,
      unit: nextUnit,
      dpi: Number(row?.artboard_dpi),
    })
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
    setDraftOutputDpi(String(dpi))

    // Artboard DPI only; do not change canonical µpx size.
    setTimeout(() => {
      void upsertWorkspace({
        ...row,
        artboard_dpi: dpi,
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
            const nextH = computeLockedDimension({ changedValue: w, ratio: r, changedAxis: "w" })
            if (nextH == null) return
            setDraftHeight(fmt2(nextH))
          }}
          mode="decimal"
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
            const nextW = computeLockedDimension({ changedValue: h, ratio: r, changedAxis: "h" })
            if (nextW == null) return
            setDraftWidth(fmt2(nextW))
          }}
          mode="decimal"
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
          {draftRasterPreset === "custom" ? <SelectItem value="custom">{`Custom (${draftOutputDpi || "?"} ppi)`}</SelectItem> : null}
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

