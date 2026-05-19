"use client"

/**
 * Artboard settings panel.
 *
 * Responsibilities:
 * - Edit workspace unit and artboard dimensions (geometry).
 * - Persist changes via `project_workspace` providers.
 *
 * Note: the artboard has no DPI (Illustrator-style). Internal geometry
 * uses a fixed 1 px = 1/72 inch mapping; users pick the display unit
 * (mm/cm/pt/px) for input only.
 */
import { memo, useCallback, useEffect, useRef, useState } from "react"
import { ArrowLeftRight, ArrowUpDown, Link2, Maximize2, Ruler, Unlink2 } from "lucide-react"

import { fmt2, type Unit } from "@/lib/editor/units"
import { parseNumericInput } from "@/lib/editor/numeric"
import {
  FormField,
  type FormFieldHandle,
  type SelectFieldOption,
} from "@/components/ui/form-controls"
import { PanelIconSlot, PanelTwoFieldRow } from "./panel-layout"
import { RightPanelToggleIconButton } from "./right-panel-controls"
import { useProjectWorkspace } from "@/lib/editor/project-workspace"
import {
  computeLockedDimension,
  computeWorkspaceUnitChange,
  normalizeUnit,
} from "@/services/editor/workspace-operations"
import { computeWorkspaceSizeSaveFromDisplay } from "@/services/editor/workspace-unit-controller"

// Module-level icon JSX so identity stays stable across re-renders. The
// FormField select variant memoizes on iconStart identity; an inline
// `<Ruler aria-hidden />` would invalidate the memo every render.
const ICON_RULER = <Ruler aria-hidden="true" />
const ICON_LR = <ArrowLeftRight aria-hidden="true" />
const ICON_UD = <ArrowUpDown aria-hidden="true" />

const UNIT_OPTIONS: ReadonlyArray<SelectFieldOption> = [
  { value: "mm", label: "mm" },
  { value: "cm", label: "cm" },
  { value: "pt", label: "pt" },
  { value: "px", label: "px" },
]

type Props = {
  canFitToImage?: boolean
  onFitToImage?: () => void
}

export const ArtboardPanel = memo(function ArtboardPanel({
  canFitToImage = false,
  onFitToImage,
}: Props) {
  const { row, loading, saving, updateWorkspaceGeometry, widthPxU, heightPxU } =
    useProjectWorkspace()

  const computedUnit = row ? normalizeUnit((row as unknown as { unit?: unknown })?.unit) : "mm"
  const computedWidth = row ? fmt2(Number(row.width_value)) : ""
  const computedHeight = row ? fmt2(Number(row.height_value)) : ""

  // Local drafts only for width / height — aspect-lock has to update the
  // partner field's draft live, which means we need an authoritative
  // source that lives above the two FormFields.
  const [draftWidth, setDraftWidth] = useState(computedWidth)
  const [draftHeight, setDraftHeight] = useState(computedHeight)
  const [lockAspect, setLockAspect] = useState(false)

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

  const sizeControlsDisabled = loading || !row || !widthPxU || !heightPxU
  const selectsDisabled = sizeControlsDisabled

  return (
    <div className="space-y-4">
      <PanelTwoFieldRow>
        <FormField
          ref={widthFieldRef}
          variant="numeric"
          label="Artboard width"
          labelVisuallyHidden
          iconStart={ICON_LR}
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
          iconStart={ICON_UD}
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
            {lockAspect ? <Link2 className="size-4" /> : <Unlink2 className="size-4" />}
          </RightPanelToggleIconButton>
        </PanelIconSlot>
      </PanelTwoFieldRow>

      <PanelTwoFieldRow>
        <FormField
          variant="select"
          label="Artboard unit"
          labelVisuallyHidden
          iconStart={ICON_RULER}
          value={computedUnit}
          options={UNIT_OPTIONS}
          onCommit={(v) => onUnitChange(v as Unit)}
          disabled={selectsDisabled}
          triggerOnPointerDownCapture={cancelPendingCommits}
        />

        <PanelIconSlot>
          <RightPanelToggleIconButton
            type="button"
            active={false}
            aria-label="Fit artboard to image"
            disabled={!canFitToImage || sizeControlsDisabled}
            onPointerDownCapture={cancelPendingCommits}
            onClick={() => onFitToImage?.()}
          >
            <Maximize2 className="size-4" />
          </RightPanelToggleIconButton>
        </PanelIconSlot>
      </PanelTwoFieldRow>
    </div>
  )
})
