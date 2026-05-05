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

import { fmt2, type Unit } from "@/lib/editor/units"
import { parseNumericInput } from "@/lib/editor/numeric"
import { AppSelectItem as SelectItem } from "@/components/ui/form-controls"
import { IconSelectField } from "./fields/icon-select-field"
import { PanelSizeField } from "./fields/panel-size-field"
import { PanelIconSlot, PanelTwoFieldRow } from "./panel-layout"
import { RightPanelToggleIconButton } from "./right-panel-controls"
import { useProjectWorkspace } from "@/lib/editor/project-workspace"
import {
  computeWorkspaceDpiChange,
  computeLockedDimension,
  computeWorkspaceUnitChange,
  mapDpiToRasterPreset,
  normalizeUnit,
} from "@/services/editor/workspace-operations"
import { computeWorkspaceSizeSaveFromDisplay } from "@/services/editor/workspace-unit-controller"
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
  const { row, loading, saving, updateWorkspaceDpi, updateWorkspaceGeometry, widthPxU, heightPxU } = useProjectWorkspace()

  const activeProjectId = row?.project_id ?? null

  const computedUnit = row ? normalizeUnit((row as unknown as { unit?: unknown })?.unit) : "mm"
  const computedOutputDpi = row ? Number((row as unknown as { output_dpi?: unknown }).output_dpi) : 300
  const computedPreset =
    row
      ? ((row.raster_effects_preset ?? mapDpiToRasterPreset(Number((row as unknown as { output_dpi?: unknown }).output_dpi)) ?? "custom") as
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

  const computedWidth = row ? fmt2(Number(row.width_value)) : ""
  const computedHeight = row ? fmt2(Number(row.height_value)) : ""

  const { value: draftWidth, setValue: setDraftWidth } = useKeyedDraft(activeProjectId, computedWidth)
  const { value: draftHeight, setValue: setDraftHeight } = useKeyedDraft(activeProjectId, computedHeight)

  const lastSubmitRef = useRef<string | null>(null)
  const ignoreNextBlurSaveRef = useRef(false)
  const geometryDirtyRef = useRef(false)
  const draftUnitRef = useRef<Unit>("mm")
  const unitChangeInFlightRef = useRef<Unit | null>(null)
  const lockRatioRef = useRef<number | null>(null)
  const pendingTaskSeqRef = useRef(0)
  const unmountedRef = useRef(false)

  useEffect(() => {
    draftUnitRef.current = draftUnit
  }, [draftUnit])

  useEffect(() => {
    // Reset lock ratio when switching projects (no setState to satisfy lint rule).
    lockRatioRef.current = null
    geometryDirtyRef.current = false
    pendingTaskSeqRef.current++
  }, [activeProjectId])

  useEffect(() => {
    unmountedRef.current = false
    return () => {
      unmountedRef.current = true
    }
  }, [])

  const schedulePersist = (task: () => Promise<void> | void) => {
    const seq = ++pendingTaskSeqRef.current
    queueMicrotask(() => {
      if (unmountedRef.current) return
      if (seq !== pendingTaskSeqRef.current) return
      void task()
    })
  }

  // Canonical size for conversions is µpx (BigInt), not integer px.
  const canonicalW = widthPxU
  const canonicalH = heightPxU

  const saveSize = async () => {
    if (!row) return
    if (saving) return
    if (!canonicalW || !canonicalH) return
    if (!geometryDirtyRef.current) return
    const computed = computeWorkspaceSizeSaveFromDisplay({
      base: row,
      draftW: draftWidth,
      draftH: draftHeight,
      unit: draftUnitRef.current,
    })
    if ("error" in computed) return

    const signature = computed.signature
    if (lastSubmitRef.current === signature) return
    lastSubmitRef.current = signature

    const saved = await updateWorkspaceGeometry({
      unit: computed.next.unit,
      widthValue: computed.next.width_value,
      heightValue: computed.next.height_value,
      widthPxU: computed.next.width_px_u,
      heightPxU: computed.next.height_px_u,
      widthPx: computed.next.width_px,
      heightPx: computed.next.height_px,
    })
    if (!saved) {
      lastSubmitRef.current = null
      return
    }

    // Reset drafts from persisted workspace values.
    const unitNormalized = normalizeUnit((saved as unknown as { unit?: unknown })?.unit)
    const nextOutput = Number((saved as unknown as { output_dpi?: unknown }).output_dpi) || computedOutputDpi
    setDraftWidth(fmt2(Number(saved.width_value)))
    setDraftHeight(fmt2(Number(saved.height_value)))
    setDraftUnit(unitNormalized)
    setDraftOutputDpi(String(nextOutput))
    setDraftRasterPreset((saved.raster_effects_preset ?? mapDpiToRasterPreset(nextOutput) ?? "custom") as "high" | "medium" | "low" | "custom")
    geometryDirtyRef.current = false
  }

  const saveUnitOnly = async (nextUnit: Unit) => {
    if (!row) return
    if (saving) return
    const computed = computeWorkspaceUnitChange({ base: row, nextUnit })
    const saved = await updateWorkspaceGeometry({
      unit: computed.next.unit,
      widthValue: computed.next.width_value,
      heightValue: computed.next.height_value,
      widthPxU: computed.next.width_px_u,
      heightPxU: computed.next.height_px_u,
      widthPx: computed.next.width_px,
      heightPx: computed.next.height_px,
    })
    if (!saved) return
    setDraftWidth(fmt2(Number(saved.width_value)))
    setDraftHeight(fmt2(Number(saved.height_value)))
    setDraftUnit(nextUnit)
    geometryDirtyRef.current = false
  }

  const onUnitChange = (nextUnit: Unit) => {
    if (loading || saving) return
    if (!canonicalW || !canonicalH) return
    if (unitChangeInFlightRef.current === nextUnit) return
    if (nextUnit === draftUnitRef.current) return
    unitChangeInFlightRef.current = nextUnit

    draftUnitRef.current = nextUnit
    setDraftUnit(nextUnit)

    schedulePersist(async () => {
      try {
        await saveUnitOnly(nextUnit)
      } finally {
        unitChangeInFlightRef.current = null
      }
    })
  }

  const onRasterPresetChange = (next: string) => {
    if (!row) return
    if (loading || saving) return
    if (next === "custom") return
    const preset = next === "high" || next === "medium" || next === "low" ? next : "high"
    const dpi = preset === "high" ? 300 : preset === "medium" ? 150 : 72
    setDraftRasterPreset(preset)
    setDraftOutputDpi(String(dpi))

    // Output DPI only; do not change canonical µpx size.
    schedulePersist(() => {
      const computed = computeWorkspaceDpiChange({ base: row, nextDpi: dpi, nextPreset: preset })
      void updateWorkspaceDpi({
        outputDpi: computed.next.output_dpi,
        rasterEffectsPreset: computed.next.raster_effects_preset ?? null,
      }).then((saved) => {
        if (!saved) return
        geometryDirtyRef.current = false
      })
    })
  }

  const controlsDisabled = loading || !row || saving || !canonicalW || !canonicalH
  const sizeControlsDisabled = loading || !row || !canonicalW || !canonicalH
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
        <PanelSizeField
          value={draftWidth}
          onValueChange={(next) => {
            setDraftWidth(next)
            geometryDirtyRef.current = true
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
          ariaLabel="Artboard width"
          disabled={sizeControlsDisabled}
          icon={<ArrowLeftRight aria-hidden="true" />}
          unit={draftUnit}
          id="artboard-width"
          onKeyDown={(e) => {
            if (e.key === "Enter") void saveSize()
          }}
          onBlur={() => {
            if (ignoreNextBlurSaveRef.current) {
              ignoreNextBlurSaveRef.current = false
              return
            }
            void saveSize()
          }}
        />

        <PanelSizeField
          value={draftHeight}
          onValueChange={(next) => {
            setDraftHeight(next)
            geometryDirtyRef.current = true
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
          ariaLabel="Artboard height"
          disabled={sizeControlsDisabled}
          icon={<ArrowUpDown aria-hidden="true" />}
          unit={draftUnit}
          id="artboard-height"
          onKeyDown={(e) => {
            if (e.key === "Enter") void saveSize()
          }}
          onBlur={() => {
            if (ignoreNextBlurSaveRef.current) {
              ignoreNextBlurSaveRef.current = false
              return
            }
            void saveSize()
          }}
        />

        <PanelIconSlot>
          <RightPanelToggleIconButton
            type="button"
            active={lockAspect}
            aria-label={lockAspect ? "Unlock proportional scaling" : "Lock proportional scaling"}
            disabled={sizeControlsDisabled}
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
            {lockAspect ? <Link2 className="size-4" strokeWidth={1} /> : <Unlink2 className="size-4" strokeWidth={1} />}
          </RightPanelToggleIconButton>
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

