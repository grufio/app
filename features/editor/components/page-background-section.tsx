"use client"

/**
 * Page-Background controls — color, opacity, visibility toggle.
 *
 * Extracted from the inline markup that used to live in
 * `ProjectEditorRightPanel.tsx` so it can be rendered in two places
 * (desktop right panel + mobile artboard sheet) without duplicating
 * the field wiring.
 *
 * Pure presentational: no hooks, no context, no draft state. Parent
 * owns the value + change callbacks, this component only renders the
 * three controls inside an `EditorSidebarSection`.
 */
import { Eye, EyeOff, Percent } from "lucide-react"

import { FormField } from "@/components/ui/form-controls"

import { EditorSidebarSection } from "./sidebar/editor-sidebar-section"
import { PanelIconSlot, PanelTwoFieldRow } from "./panel-layout"
import { RightPanelToggleIconButton } from "./right-panel-controls"

export function PageBackgroundSection(props: {
  pageBgEnabled: boolean
  pageBgColor: string
  pageBgOpacity: number
  onPageBgEnabledChange: (v: boolean) => void
  onPageBgColorChange: (v: string) => void
  onPageBgOpacityChange: (v: number) => void
}) {
  const {
    pageBgEnabled,
    pageBgColor,
    pageBgOpacity,
    onPageBgEnabledChange,
    onPageBgColorChange,
    onPageBgOpacityChange,
  } = props

  return (
    <EditorSidebarSection title="Page">
      <PanelTwoFieldRow>
        <FormField
          variant="color"
          label="Page background color"
          labelVisuallyHidden
          value={pageBgColor}
          onCommit={onPageBgColorChange}
          inputClassName="cursor-pointer"
        />

        <FormField
          variant="numeric"
          numericMode="int"
          label="Page background opacity percent"
          labelVisuallyHidden
          iconStart={<Percent aria-hidden="true" />}
          value={String(pageBgOpacity)}
          onCommit={(next) => {
            const n = Number(next)
            const clamped = Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0))
            onPageBgOpacityChange(clamped)
          }}
        />

        <PanelIconSlot>
          <RightPanelToggleIconButton
            type="button"
            active={!pageBgEnabled}
            aria-label={pageBgEnabled ? "Hide page background" : "Show page background"}
            onClick={() => onPageBgEnabledChange(!pageBgEnabled)}
          >
            {pageBgEnabled ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          </RightPanelToggleIconButton>
        </PanelIconSlot>
      </PanelTwoFieldRow>
    </EditorSidebarSection>
  )
}
