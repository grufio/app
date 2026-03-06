"use client"

/**
 * Grid settings panel.
 *
 * Responsibilities:
 * - Configure grid spacing and line style for the editor artboard.
 * - Persist settings via `project_grid`.
 */
import { useCallback, useEffect, useRef, type KeyboardEventHandler, type ReactNode } from "react"
import { ArrowLeftRight, ArrowUpDown, Eye, EyeOff, Percent } from "lucide-react"

import { IconColorField } from "./fields/icon-color-field"
import { IconNumericField } from "./fields/icon-numeric-field"
import { NumericInput } from "./numeric-input"
import { PanelIconSlot, PanelTwoFieldRow } from "./panel-layout"
import { EditorSidebarSection } from "./sidebar/editor-sidebar-section"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupText } from "@/components/ui/form-controls/input-group"
import { useProjectGrid, type ProjectGridRow } from "@/lib/editor/project-grid"
import { useProjectWorkspace } from "@/lib/editor/project-workspace"
import { computeGridUpsert } from "@/services/editor"
import { useKeyedDraft } from "@/lib/editor/use-keyed-draft"
import { fmt2 } from "@/lib/editor/units"

function GridSizeField({
  value,
  ariaLabel,
  disabled,
  icon,
  unit,
  onValueChange,
  onBlur,
  onKeyDown,
}: {
  value: string
  ariaLabel: string
  disabled: boolean
  icon: ReactNode
  unit: string
  onValueChange: (next: string) => void
  onBlur: () => void
  onKeyDown: KeyboardEventHandler<HTMLInputElement>
}) {
  return (
    <InputGroup>
      <NumericInput
        value={value}
        onValueChange={onValueChange}
        aria-label={ariaLabel}
        disabled={disabled}
        mode="decimal"
        onKeyDown={onKeyDown}
        onBlur={onBlur}
      />
      <InputGroupAddon align="inline-start" aria-hidden="true">
        {icon}
      </InputGroupAddon>
      <InputGroupAddon align="inline-end" className="pointer-events-none" aria-hidden="true">
        <InputGroupText>{unit}</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  )
}

export function GridPanel({
  gridVisible,
  onGridVisibleChange,
}: {
  gridVisible: boolean
  onGridVisibleChange: (v: boolean) => void
}) {
  const { projectId, row, loading, saving, error, upsertGrid } = useProjectGrid()
  const { unit: workspaceUnit } = useProjectWorkspace()

  const effectiveUnit = workspaceUnit ?? row?.unit ?? "cm"

  const computedW = row ? fmt2(Number(row.spacing_x_value)) : ""
  const computedH = row ? fmt2(Number(row.spacing_y_value)) : ""
  const computedOpacity = String(Math.max(0, Math.min(100, Number(row?.line_width_value ?? 100))))

  const { value: draftW, setValue: setDraftW } = useKeyedDraft(projectId ?? null, computedW)
  const { value: draftH, setValue: setDraftH } = useKeyedDraft(projectId ?? null, computedH)
  const { value: draftOpacity, setValue: setDraftOpacity } = useKeyedDraft(projectId ?? null, computedOpacity)

  const lastSubmitRef = useRef<string | null>(null)
  const ignoreNextBlurSaveRef = useRef(false)

  useEffect(() => {
    // Reset drafts when switching projects.
    lastSubmitRef.current = null
  }, [projectId])

  const controlsDisabled = loading || !row || saving

  const saveWith = useCallback(
    async (next: ProjectGridRow) => {
      if (!row) return
      if (saving) return

      const { next: merged, signature } = computeGridUpsert(next, row)
      if (lastSubmitRef.current === signature) return
      lastSubmitRef.current = signature

      await upsertGrid(merged)
    },
    [row, saving, upsertGrid]
  )

  const save = useCallback(async () => {
    if (!row) return
    const w = Number(draftW)
    const h = Number(draftH)
    const opacityRaw = Number(draftOpacity)
    if (!Number.isFinite(w) || w <= 0) return
    if (!Number.isFinite(h) || h <= 0) return
    if (!Number.isFinite(opacityRaw)) return
    const opacity = Math.max(0, Math.min(100, Math.round(opacityRaw)))

    await saveWith({
      ...row,
      unit: effectiveUnit,
      spacing_value: w,
      spacing_x_value: w,
      spacing_y_value: h,
      line_width_value: opacity,
    })
  }, [draftH, draftOpacity, draftW, effectiveUnit, row, saveWith])

  return (
    <EditorSidebarSection
      title="Grid"
      headerActions={
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled={loading || !row}
          aria-label={gridVisible ? "Hide grid" : "Show grid"}
          onClick={() => onGridVisibleChange(!gridVisible)}
        >
          {gridVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
      }
    >
      {!row && !loading && error ? (
        <div className="text-sm text-destructive">{error}</div>
      ) : null}
      <div className="space-y-4">
        <PanelTwoFieldRow>
          <GridSizeField
            value={draftW}
            ariaLabel={`Grid width (${effectiveUnit})`}
            disabled={controlsDisabled}
            icon={<ArrowLeftRight aria-hidden="true" />}
            unit={effectiveUnit}
            onValueChange={(next) => setDraftW(next)}
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
          />

          <GridSizeField
            value={draftH}
            ariaLabel={`Grid height (${effectiveUnit})`}
            disabled={controlsDisabled}
            icon={<ArrowUpDown aria-hidden="true" />}
            unit={effectiveUnit}
            onValueChange={(next) => setDraftH(next)}
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
          />

          <PanelIconSlot />
        </PanelTwoFieldRow>

        <PanelTwoFieldRow>
          <IconColorField
            value={row?.color ?? "#000000"}
            onChange={(next) => {
              void saveWith({
                ...(row as ProjectGridRow),
                unit: effectiveUnit,
                spacing_value: (row as ProjectGridRow).spacing_x_value,
                color: next,
                line_width_value: Math.max(0, Math.min(100, Number(draftOpacity))),
              })
            }}
            ariaLabel="Grid line color"
            disabled={controlsDisabled}
            inputClassName="cursor-pointer"
          />

          <IconNumericField
            value={draftOpacity}
            mode="int"
            ariaLabel="Grid line opacity percent"
            disabled={controlsDisabled}
            icon={<Percent aria-hidden="true" />}
            onValueChange={setDraftOpacity}
            numericProps={{
              onKeyDown: (e) => {
                if (e.key === "Enter") void save()
              },
              onBlur: () => {
                if (ignoreNextBlurSaveRef.current) {
                  ignoreNextBlurSaveRef.current = false
                  return
                }
                void save()
              },
            }}
          />

          <PanelIconSlot />
        </PanelTwoFieldRow>
      </div>
    </EditorSidebarSection>
  )
}

