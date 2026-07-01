"use client"

/**
 * Padding controls — the print margin (distance from the image area to the
 * page) per side, in mm. Four numeric fields.
 *
 * Pure presentational: no hooks, no context, no draft state. Parent owns the
 * values + change callbacks (see `use-padding-state.ts`).
 */
import { FormField } from "@/components/ui/form-controls"

import { EditorSidebarSection } from "./sidebar/editor-sidebar-section"
import { PanelIconSlot, PanelTwoFieldRow } from "./panel-layout"

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
          unit="mm"
          value={paddingTop}
          onCommit={onPaddingTopChange}
          disabled={disabled}
        />
        <FormField
          variant="numeric"
          numericMode="decimal"
          label="Padding bottom"
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
          unit="mm"
          value={paddingLeft}
          onCommit={onPaddingLeftChange}
          disabled={disabled}
        />
        <FormField
          variant="numeric"
          numericMode="decimal"
          label="Padding right"
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
