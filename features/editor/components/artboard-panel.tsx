"use client"

/**
 * Artboard settings panel.
 *
 * Responsibilities:
 * - Edit workspace unit and artboard dimensions (geometry).
 * - Edit artboard DPI.
 * - Persist changes via `project_workspace` providers.
 *
 * Phase 3.2 of the form-fields unification: width / height inputs are
 * now <FormField variant="numeric">. Aspect-lock uses `onDraftChange`
 * for live binding (typing W updates H draft when locked), `onCommit`
 * for the persist. The lock button + selects cancel pending blur-
 * commits via the imperative `cancelPendingCommit()` handle on each
 * field, replacing the old `ignoreNextBlurSaveRef` pattern.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowLeftRight, ArrowUpDown, Gauge, Link2, Ruler, Unlink2 } from "lucide-react"

import { fmt2, type Unit } from "@/lib/editor/units"
import { parseNumericInput } from "@/lib/editor/numeric"
import {
  AppSelectItem as SelectItem,
  FormField,
  type FormFieldHandle,
} from "@/components/ui/form-controls"
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

function labelForPreset(p: "high" | "medium" | "low"): string {
  if (p === "high") return "High (300 ppi)"
  if (p === "medium") return "Medium (150 ppi)"
  return "Low (72 ppi)"
}

export function ArtboardPanel() {
  const { row, loading, saving, updateWorkspaceDpi, updateWorkspaceGeometry, widthPxU, heightPxU } =
    useProjectWorkspace()

  const computedUnit = row ? normalizeUnit((row as unknown as { unit?: unknown })?.unit) : "mm"
  const computedOutputDpi = row ? Number((row as unknown as { output_dpi?: unknown }).output_dpi) : 300
  const computedPreset = row
    ? ((row.raster_effects_preset ??
        mapDpiToRasterPreset(Number((row as unknown as { output_dpi?: unknown }).output_dpi)) ??
        "custom") as "high" | "medium" | "low" | "custom")
    : "high"
  const computedWidth = row ? fmt2(Number(row.width_value)) : ""
  const computedHeight = row ? fmt2(Number(row.height_value)) : ""

  // Local drafts only for width / height — aspect-lock has to update the
  // partner field's draft live, which means we need an authoritative
  // source that lives above the two FormFields. Unit / preset / dpi
  // commit immediately on selection so they read straight off the row.
  const [draftWidth, setDraftWidth] = useState(computedWidth)
  const [draftHeight, setDraftHeight] = useState(computedHeight)
  const [lockAspect, setLockAspect] = useState(false)

  // Sync local drafts when upstream changes and we're not editing.
  // FormField's own draft has the same logic, but we need the upstream
  // value here for the aspect-lock partner-binding math.
  useEffect(() => {
    setDraftWidth(computedWidth)
  }, [computedWidth])
  useEffect(() => {
    setDraftHeight(computedHeight)
  }, [computedHeight])

  const lockRatioRef = useRef<number | null>(null)
  const widthFieldRef = useRef<FormFieldHandle>(null)
  const heightFieldRef = useRef<FormFieldHandle>(null)

  const ensureRatio = useCallback(() => {
    const w = parseNumericInput(draftWidth)
    const h = parseNumericInput(draftHeight)
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null
    return w / h
  }, [draftWidth, draftHeight])

  const saveSize = useCallback(
    async (committedW: string, committedH: string) => {
      if (!row) return
      if (saving) return
      if (!widthPxU || !heightPxU) return
      const computed = computeWorkspaceSizeSaveFromDisplay({
        base: row,
        draftW: committedW,
        draftH: committedH,
        unit: computedUnit,
      })
      if ("error" in computed) return
      await updateWorkspaceGeometry({
        unit: computed.next.unit,
        widthValue: computed.next.width_value,
        heightValue: computed.next.height_value,
        widthPxU: computed.next.width_px_u,
        heightPxU: computed.next.height_px_u,
        widthPx: computed.next.width_px,
        heightPx: computed.next.height_px,
      })
    },
    [row, saving, widthPxU, heightPxU, computedUnit, updateWorkspaceGeometry]
  )

  const onCommitWidth = useCallback(
    (next: string) => {
      // FormField has already updated its internal draft; mirror it here
      // so the next aspect-lock partner-update reads the freshest value.
      setDraftWidth(next)
      void saveSize(next, draftHeight)
    },
    [saveSize, draftHeight]
  )

  const onCommitHeight = useCallback(
    (next: string) => {
      setDraftHeight(next)
      void saveSize(draftWidth, next)
    },
    [saveSize, draftWidth]
  )

  const onDraftWidth = useCallback(
    (next: string) => {
      setDraftWidth(next)
      if (!lockAspect) return
      const r = lockRatioRef.current ?? ensureRatio()
      if (!r) return
      lockRatioRef.current = r
      const w = parseNumericInput(next)
      if (!Number.isFinite(w) || w <= 0) return
      const nextH = computeLockedDimension({ changedValue: w, ratio: r, changedAxis: "w" })
      if (nextH == null) return
      setDraftHeight(fmt2(nextH))
    },
    [lockAspect, ensureRatio]
  )

  const onDraftHeight = useCallback(
    (next: string) => {
      setDraftHeight(next)
      if (!lockAspect) return
      const r = lockRatioRef.current ?? ensureRatio()
      if (!r) return
      lockRatioRef.current = r
      const h = parseNumericInput(next)
      if (!Number.isFinite(h) || h <= 0) return
      const nextW = computeLockedDimension({ changedValue: h, ratio: r, changedAxis: "h" })
      if (nextW == null) return
      setDraftWidth(fmt2(nextW))
    },
    [lockAspect, ensureRatio]
  )

  // Cancel pending blur-commit on both fields. Used by the lock toggle
  // and by select triggers — clicking either implicitly blurs the focused
  // input, but that blur isn't a user commit.
  const cancelPendingCommits = useCallback(() => {
    widthFieldRef.current?.cancelPendingCommit()
    heightFieldRef.current?.cancelPendingCommit()
  }, [])

  const unitChangeInFlightRef = useRef<Unit | null>(null)
  const onUnitChange = useCallback(
    async (nextUnit: Unit) => {
      if (loading || saving) return
      if (!widthPxU || !heightPxU) return
      if (!row) return
      if (unitChangeInFlightRef.current === nextUnit) return
      if (nextUnit === computedUnit) return
      unitChangeInFlightRef.current = nextUnit
      try {
        const computed = computeWorkspaceUnitChange({ base: row, nextUnit })
        await updateWorkspaceGeometry({
          unit: computed.next.unit,
          widthValue: computed.next.width_value,
          heightValue: computed.next.height_value,
          widthPxU: computed.next.width_px_u,
          heightPxU: computed.next.height_px_u,
          widthPx: computed.next.width_px,
          heightPx: computed.next.height_px,
        })
      } finally {
        unitChangeInFlightRef.current = null
      }
    },
    [loading, saving, widthPxU, heightPxU, row, computedUnit, updateWorkspaceGeometry]
  )

  const onPresetChange = useCallback(
    (next: string) => {
      if (!row || loading || saving) return
      if (next !== "high" && next !== "medium" && next !== "low") return
      const dpi = next === "high" ? 300 : next === "medium" ? 150 : 72
      const computed = computeWorkspaceDpiChange({ base: row, nextDpi: dpi, nextPreset: next })
      void updateWorkspaceDpi({
        outputDpi: computed.next.output_dpi,
        rasterEffectsPreset: computed.next.raster_effects_preset ?? null,
      })
    },
    [row, loading, saving, updateWorkspaceDpi]
  )

  const sizeControlsDisabled = loading || !row || !widthPxU || !heightPxU
  const controlsDisabled = sizeControlsDisabled || saving

  return (
    <div className="space-y-4">
      <PanelTwoFieldRow>
        <FormField
          ref={widthFieldRef}
          variant="numeric"
          label="Artboard width"
          labelVisuallyHidden
          iconStart={<ArrowLeftRight aria-hidden="true" />}
          unit={computedUnit}
          id="artboard-width"
          value={draftWidth}
          onCommit={onCommitWidth}
          onDraftChange={onDraftWidth}
          disabled={sizeControlsDisabled}
        />

        <FormField
          ref={heightFieldRef}
          variant="numeric"
          label="Artboard height"
          labelVisuallyHidden
          iconStart={<ArrowUpDown aria-hidden="true" />}
          unit={computedUnit}
          id="artboard-height"
          value={draftHeight}
          onCommit={onCommitHeight}
          onDraftChange={onDraftHeight}
          disabled={sizeControlsDisabled}
        />

        <PanelIconSlot>
          <RightPanelToggleIconButton
            type="button"
            active={lockAspect}
            aria-label={lockAspect ? "Unlock proportional scaling" : "Lock proportional scaling"}
            disabled={sizeControlsDisabled}
            onPointerDownCapture={cancelPendingCommits}
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
        <FormField
          variant="select"
          label="Raster effects resolution"
          labelVisuallyHidden
          iconStart={<Gauge aria-hidden="true" />}
          value={computedPreset}
          onCommit={onPresetChange}
          disabled={controlsDisabled}
          triggerOnPointerDownCapture={cancelPendingCommits}
        >
          <SelectItem value="high">{labelForPreset("high")}</SelectItem>
          <SelectItem value="medium">{labelForPreset("medium")}</SelectItem>
          <SelectItem value="low">{labelForPreset("low")}</SelectItem>
          {computedPreset === "custom" ? (
            <SelectItem value="custom">{`Custom (${computedOutputDpi || "?"} ppi)`}</SelectItem>
          ) : null}
        </FormField>

        <FormField
          variant="select"
          label="Artboard unit"
          labelVisuallyHidden
          iconStart={<Ruler aria-hidden="true" />}
          value={computedUnit}
          onCommit={(v) => onUnitChange(v as Unit)}
          disabled={controlsDisabled}
          triggerOnPointerDownCapture={cancelPendingCommits}
        >
          <SelectItem value="mm">mm</SelectItem>
          <SelectItem value="cm">cm</SelectItem>
          <SelectItem value="pt">pt</SelectItem>
          <SelectItem value="px">px</SelectItem>
        </FormField>

        <PanelIconSlot />
      </PanelTwoFieldRow>
    </div>
  )
}
