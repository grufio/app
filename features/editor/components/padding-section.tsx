"use client"

/**
 * Padding controls — the print margin (distance from the image area to the
 * page) per side, in mm. Four numeric fields, one per side, each with a
 * direction icon inside the field (the label is visually hidden, per the
 * editor convention shared with `ArtboardPanel` / `GridPanel`).
 *
 * Self-contained (like `ArtboardPanel` / `GridPanel`, the form-fields
 * unification): reads `row` straight from `useProjectWorkspace()` and saves on
 * FormField commit (blur/Enter) via `updateWorkspacePadding` — no shell hook,
 * no prop threading. The provider serialises writes (`enqueueLatestDropStale`),
 * so no local debounce is needed. Each side commits its own changed value; the
 * three unchanged sides are read straight off the current `row`.
 *
 * Canonical padding is µpx-as-text; the fields display/accept mm.
 */
import { useCallback } from "react"
import { ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine, ArrowUpToLine } from "lucide-react"

import { FormField } from "@/components/ui/form-controls"
import { useProjectWorkspace } from "@/lib/editor/project-workspace"
import { pxUToUnitDisplayUiFixed, unitToPxUFixed } from "@/lib/editor/units"
import { normalizeWorkspacePadding } from "@/services/editor/padding"

import { EditorSidebarSection } from "./sidebar/editor-sidebar-section"
import { PanelIconSlot, PanelTwoFieldRow } from "./panel-layout"

// Stable element identities — FormField's numeric variant memoizes on
// `iconStart` identity, so these must not be re-created per render.
const ICON_TOP = <ArrowUpToLine aria-hidden="true" />
const ICON_BOTTOM = <ArrowDownToLine aria-hidden="true" />
const ICON_LEFT = <ArrowLeftToLine aria-hidden="true" />
const ICON_RIGHT = <ArrowRightToLine aria-hidden="true" />

type Side = "top" | "bottom" | "left" | "right"

export function PaddingSection() {
  const { row, loading, saving, updateWorkspacePadding } = useProjectWorkspace()

  const p = normalizeWorkspacePadding(row)
  const mm = (pxU: string) => pxUToUnitDisplayUiFixed(BigInt(pxU), "mm")
  // Empty (not "0") while the row is unloaded — mirrors `ArtboardPanel`.
  const toDisplay = (pxU: string) => (row ? mm(pxU) : "")

  const controlsDisabled = loading || !row || saving

  // Commit one side; the other three are read straight off the current `row`
  // (the µpx source of truth), mirroring `GridPanel.saveOne`.
  const saveOne = useCallback(
    (side: Side, next: string) => {
      if (!row) return
      const base = normalizeWorkspacePadding(row)
      const toU = (mmStr: string) => unitToPxUFixed(mmStr.trim() || "0", "mm").toString()
      void updateWorkspacePadding({
        topPxU: side === "top" ? toU(next) : base.topPxU,
        bottomPxU: side === "bottom" ? toU(next) : base.bottomPxU,
        leftPxU: side === "left" ? toU(next) : base.leftPxU,
        rightPxU: side === "right" ? toU(next) : base.rightPxU,
      })
    },
    [row, updateWorkspacePadding]
  )

  const onCommitTop = useCallback((next: string) => saveOne("top", next), [saveOne])
  const onCommitBottom = useCallback((next: string) => saveOne("bottom", next), [saveOne])
  const onCommitLeft = useCallback((next: string) => saveOne("left", next), [saveOne])
  const onCommitRight = useCallback((next: string) => saveOne("right", next), [saveOne])

  return (
    <EditorSidebarSection title="Padding">
      <div className="space-y-4">
        <PanelTwoFieldRow>
          <FormField
            variant="numeric"
            numericMode="decimal"
            label="Padding top"
            labelVisuallyHidden
            iconStart={ICON_TOP}
            unit="mm"
            value={toDisplay(p.topPxU)}
            onCommit={onCommitTop}
            disabled={controlsDisabled}
          />
          <FormField
            variant="numeric"
            numericMode="decimal"
            label="Padding bottom"
            labelVisuallyHidden
            iconStart={ICON_BOTTOM}
            unit="mm"
            value={toDisplay(p.bottomPxU)}
            onCommit={onCommitBottom}
            disabled={controlsDisabled}
          />
          <PanelIconSlot />
        </PanelTwoFieldRow>
        <PanelTwoFieldRow>
          <FormField
            variant="numeric"
            numericMode="decimal"
            label="Padding left"
            labelVisuallyHidden
            iconStart={ICON_LEFT}
            unit="mm"
            value={toDisplay(p.leftPxU)}
            onCommit={onCommitLeft}
            disabled={controlsDisabled}
          />
          <FormField
            variant="numeric"
            numericMode="decimal"
            label="Padding right"
            labelVisuallyHidden
            iconStart={ICON_RIGHT}
            unit="mm"
            value={toDisplay(p.rightPxU)}
            onCommit={onCommitRight}
            disabled={controlsDisabled}
          />
          <PanelIconSlot />
        </PanelTwoFieldRow>
      </div>
    </EditorSidebarSection>
  )
}
