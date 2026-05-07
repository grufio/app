"use client"

/**
 * Grid settings panel.
 *
 * Responsibilities:
 * - Configure grid spacing and line style for the editor artboard.
 * - Persist settings via `project_grid`.
 *
 * Phase 3.1 of the form-fields unification: each field is now a
 * <FormField> with a one-shot onCommit callback. The previous
 * external draft state (useKeyedDraft) and dedup ref (lastSubmitRef)
 * are gone — FormField's internal draft handles preservation across
 * tabs, and the reducer skips commits when draft equals value, which
 * is enough dedup for this panel.
 */
import { useCallback } from "react"
import { ArrowLeftRight, ArrowUpDown, Eye, EyeOff, Percent } from "lucide-react"

import { PanelIconSlot, PanelTwoFieldRow } from "./panel-layout"
import { EditorSidebarSection } from "./sidebar/editor-sidebar-section"
import { AppButton, FormField } from "@/components/ui/form-controls"
import { cn } from "@/lib/utils"
import { useProjectGrid, type ProjectGridRow } from "@/lib/editor/project-grid"
import { useProjectWorkspace } from "@/lib/editor/project-workspace"
import { fmt2 } from "@/lib/editor/units"

export function GridPanel({
  gridVisible,
  onGridVisibleChange,
}: {
  gridVisible: boolean
  onGridVisibleChange: (v: boolean) => void
}) {
  const { row, loading, saving, error, upsertGrid } = useProjectGrid()
  const { unit: workspaceUnit } = useProjectWorkspace()

  const effectiveUnit = workspaceUnit ?? row?.unit ?? "cm"

  const computedW = row ? fmt2(Number(row.spacing_x_value)) : ""
  const computedH = row ? fmt2(Number(row.spacing_y_value)) : ""
  const computedOpacity = String(Math.max(0, Math.min(100, Number(row?.line_width_value ?? 100))))

  const controlsDisabled = loading || !row || saving

  // Each field commits its own changed value; the unchanged fields are
  // read straight off the current `row` (the upstream source of truth).
  const saveOne = useCallback(
    (patch: Partial<ProjectGridRow>) => {
      if (!row) return
      const merged: ProjectGridRow = { ...row, unit: effectiveUnit, ...patch }
      // Keep legacy NOT NULL `spacing_value` consistent with x spacing.
      merged.spacing_value = merged.spacing_x_value
      void upsertGrid(merged)
    },
    [row, effectiveUnit, upsertGrid]
  )

  const onCommitW = useCallback(
    (next: string) => {
      const w = Number(next)
      if (!Number.isFinite(w) || w <= 0) return
      saveOne({ spacing_x_value: w })
    },
    [saveOne]
  )

  const onCommitH = useCallback(
    (next: string) => {
      const h = Number(next)
      if (!Number.isFinite(h) || h <= 0) return
      saveOne({ spacing_y_value: h })
    },
    [saveOne]
  )

  const onCommitOpacity = useCallback(
    (next: string) => {
      const opacityRaw = Number(next)
      if (!Number.isFinite(opacityRaw)) return
      const opacity = Math.max(0, Math.min(100, Math.round(opacityRaw)))
      saveOne({ line_width_value: opacity })
    },
    [saveOne]
  )

  const onCommitColor = useCallback((next: string) => saveOne({ color: next }), [saveOne])

  return (
    <EditorSidebarSection
      title="Grid"
      headerActions={
        <AppButton
          type="button"
          variant="ghost"
          size="icon"
          aria-pressed={gridVisible}
          aria-label={gridVisible ? "Hide grid" : "Show grid"}
          disabled={loading || !row}
          className={cn(
            gridVisible && "bg-black text-white hover:bg-black/90 hover:text-white"
          )}
          onClick={() => onGridVisibleChange(!gridVisible)}
        >
          {gridVisible ? <EyeOff className="size-4" strokeWidth={1} /> : <Eye className="size-4" strokeWidth={1} />}
        </AppButton>
      }
    >
      {!row && !loading && error ? (
        <div className="text-sm text-destructive">{error}</div>
      ) : null}
      <div className="space-y-4">
        <PanelTwoFieldRow>
          <FormField
            variant="numeric"
            numericMode="decimal"
            label={`Grid width (${effectiveUnit})`}
            labelVisuallyHidden
            iconStart={<ArrowLeftRight aria-hidden="true" strokeWidth={1} />}
            unit={effectiveUnit}
            value={computedW}
            onCommit={onCommitW}
            disabled={controlsDisabled}
          />

          <FormField
            variant="numeric"
            numericMode="decimal"
            label={`Grid height (${effectiveUnit})`}
            labelVisuallyHidden
            iconStart={<ArrowUpDown aria-hidden="true" strokeWidth={1} />}
            unit={effectiveUnit}
            value={computedH}
            onCommit={onCommitH}
            disabled={controlsDisabled}
          />

          <PanelIconSlot />
        </PanelTwoFieldRow>

        <PanelTwoFieldRow>
          <FormField
            variant="color"
            label="Grid line color"
            labelVisuallyHidden
            value={row?.color ?? "#000000"}
            onCommit={onCommitColor}
            disabled={controlsDisabled}
            inputClassName="cursor-pointer"
          />

          <FormField
            variant="numeric"
            numericMode="int"
            label="Grid line opacity percent"
            labelVisuallyHidden
            iconStart={<Percent aria-hidden="true" strokeWidth={1} />}
            value={computedOpacity}
            onCommit={onCommitOpacity}
            disabled={controlsDisabled}
          />

          <PanelIconSlot />
        </PanelTwoFieldRow>
      </div>
    </EditorSidebarSection>
  )
}
