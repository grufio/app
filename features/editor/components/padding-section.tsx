"use client"

/**
 * Padding controls — the print margin (distance from the image area to the
 * page) per side, in mm. Four numeric fields, one per side, each with a
 * direction icon inside the field (the label is visually hidden, per the
 * editor convention shared with `ArtboardPanel` / `GridPanel`).
 *
 * Pure presentational: no hooks, no context, no draft state. Parent owns the
 * values + change callbacks (see `use-padding-state.ts`).
 */
import { ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine, ArrowUpToLine } from "lucide-react"

import { FormField } from "@/components/ui/form-controls"

import { EditorSidebarSection } from "./sidebar/editor-sidebar-section"
import { PanelIconSlot, PanelTwoFieldRow } from "./panel-layout"

// Stable element identities — FormField's numeric variant memoizes on
// `iconStart` identity, so these must not be re-created per render.
const ICON_TOP = <ArrowUpToLine aria-hidden="true" />
const ICON_BOTTOM = <ArrowDownToLine aria-hidden="true" />
const ICON_LEFT = <ArrowLeftToLine aria-hidden="true" />
const ICON_RIGHT = <ArrowRightToLine aria-hidden="true" />

export function PaddingSection(props: {
  paddingTop: string
  paddingBottom: string
  paddingLeft: string
  paddingRight: string
  onPaddingTopChange: (v: string) => void
  onPaddingBottomChange: (v: string) => void
  onPaddingLeftChange: (v: string) => void
  onPaddingRightChange: (v: string) => void
  disabled?: boolean
}) {
  const {
    paddingTop,
    paddingBottom,
    paddingLeft,
    paddingRight,
    onPaddingTopChange,
    onPaddingBottomChange,
    onPaddingLeftChange,
    onPaddingRightChange,
    disabled,
  } = props

  return (
    <EditorSidebarSection title="Padding">
      <PanelTwoFieldRow>
        <FormField
          variant="numeric"
          numericMode="decimal"
          label="Padding top"
          labelVisuallyHidden
          iconStart={ICON_TOP}
          unit="mm"
          value={paddingTop}
          onCommit={onPaddingTopChange}
          disabled={disabled}
        />
        <FormField
          variant="numeric"
          numericMode="decimal"
          label="Padding bottom"
          labelVisuallyHidden
          iconStart={ICON_BOTTOM}
          unit="mm"
          value={paddingBottom}
          onCommit={onPaddingBottomChange}
          disabled={disabled}
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
          value={paddingLeft}
          onCommit={onPaddingLeftChange}
          disabled={disabled}
        />
        <FormField
          variant="numeric"
          numericMode="decimal"
          label="Padding right"
          labelVisuallyHidden
          iconStart={ICON_RIGHT}
          unit="mm"
          value={paddingRight}
          onCommit={onPaddingRightChange}
          disabled={disabled}
        />
        <PanelIconSlot />
      </PanelTwoFieldRow>
    </EditorSidebarSection>
  )
}
