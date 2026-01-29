"use client"

/**
 * Grid settings panel.
 *
 * Responsibilities:
 * - Configure grid spacing and line style for the editor artboard.
 * - Persist settings via `project_grid`.
 */
import { useCallback, useEffect, useRef } from "react"
import { ArrowLeftRight, ArrowUpDown, Palette, Ruler } from "lucide-react"

import { IconColorField } from "./fields/icon-color-field"
import { IconNumericField } from "./fields/icon-numeric-field"
import { PanelIconSlot, PanelTwoFieldRow } from "./panel-layout"
import { EditorSidebarSection } from "./sidebar/editor-sidebar-section"
import { useProjectGrid, type ProjectGridRow } from "@/lib/editor/project-grid"
import { useProjectWorkspace } from "@/lib/editor/project-workspace"
import { computeGridUpsert } from "@/services/editor"
import { useKeyedDraft } from "@/lib/editor/use-keyed-draft"

export function GridPanel() {
  const { projectId, row, loading, saving, error, upsertGrid } = useProjectGrid()
  const { unit: workspaceUnit } = useProjectWorkspace()

  const effectiveUnit = workspaceUnit ?? row?.unit ?? "cm"

  const computedW = row ? String(row.spacing_x_value) : ""
  const computedH = row ? String(row.spacing_y_value) : ""
  const computedLineWidth = row ? String(row.line_width_value) : ""

  const { value: draftW, setValue: setDraftW } = useKeyedDraft(projectId ?? null, computedW)
  const { value: draftH, setValue: setDraftH } = useKeyedDraft(projectId ?? null, computedH)
  const { value: draftLineWidth, setValue: setDraftLineWidth } = useKeyedDraft(projectId ?? null, computedLineWidth)

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
    const lw = Number(draftLineWidth)
    if (!Number.isFinite(w) || w <= 0) return
    if (!Number.isFinite(h) || h <= 0) return
    if (!Number.isFinite(lw) || lw <= 0) return

    await saveWith({
      ...row,
      unit: effectiveUnit,
      spacing_value: w,
      spacing_x_value: w,
      spacing_y_value: h,
      line_width_value: lw,
    })
  }, [draftH, draftLineWidth, draftW, effectiveUnit, row, saveWith])

  return (
    <EditorSidebarSection title="Grid">
      {!row && !loading && error ? (
        <div className="text-sm text-destructive">{error}</div>
      ) : null}
      <div className="space-y-4">
        <PanelTwoFieldRow>
          <IconNumericField
            value={draftW}
            mode="float"
            ariaLabel={`Grid width (${effectiveUnit})`}
            disabled={controlsDisabled}
            icon={<ArrowLeftRight aria-hidden="true" />}
            onValueChange={(next) => setDraftW(next)}
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

          <IconNumericField
            value={draftH}
            mode="float"
            ariaLabel={`Grid height (${effectiveUnit})`}
            disabled={controlsDisabled}
            icon={<ArrowUpDown aria-hidden="true" />}
            onValueChange={(next) => setDraftH(next)}
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

        <PanelTwoFieldRow>
          <IconColorField
            value={row?.color ?? "#000000"}
            onChange={(next) => {
              void saveWith({
                ...(row as ProjectGridRow),
                unit: effectiveUnit,
                spacing_value: (row as ProjectGridRow).spacing_x_value,
                color: next,
              })
            }}
            ariaLabel="Grid line color"
            disabled={controlsDisabled}
            icon={<Palette aria-hidden="true" />}
            inputClassName="cursor-pointer"
          />

          <IconNumericField
            value={draftLineWidth}
            mode="float"
            ariaLabel={`Grid line width (${effectiveUnit})`}
            disabled={controlsDisabled}
            icon={<Ruler aria-hidden="true" />}
            onValueChange={(next) => setDraftLineWidth(next)}
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
              onPointerDownCapture: () => {
                // Avoid blur-save firing when interacting with the color picker.
                ignoreNextBlurSaveRef.current = true
              },
            }}
          />

          <PanelIconSlot />
        </PanelTwoFieldRow>
      </div>
    </EditorSidebarSection>
  )
}

