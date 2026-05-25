"use client"

/**
 * Shared "Colors" segment fields for trace dialogs (Pixelate + Circulate).
 *
 * Two selects laid out in the panel grid: the palette mode (S/W vs Color →
 * `color_mode`, which DB palette the server snaps cells to) and the PDF colour
 * space (RGB/CMYK → `color_space`, stored-only, no effect on detection). The
 * shared contract lives here so the two traces can't drift on labels, options,
 * or ids. Each form wraps this in its own `EditorSidebarSection title="Colors"`.
 */
import { Palette, Printer } from "lucide-react"

import { FormField, type SelectFieldOption } from "@/components/ui/form-controls"

import { PanelIconSlot, PanelTwoFieldRow } from "../panel-layout"

export type TraceColorMode = "color" | "bw"
export type TraceColorSpace = "rgb" | "cmyk"

// Module-level so the `options` reference stays stable across renders (the
// select FormField memoises on `prev.options === next.options`).
const COLOR_MODE_OPTIONS: SelectFieldOption[] = [
  { value: "color", label: "Color" },
  { value: "bw", label: "S/W" },
]
const COLOR_SPACE_OPTIONS: SelectFieldOption[] = [
  { value: "rgb", label: "RGB" },
  { value: "cmyk", label: "CMYK" },
]

export function TraceColorsFields(props: {
  colorMode: TraceColorMode
  colorSpace: TraceColorSpace
  onColorModeChange: (value: TraceColorMode) => void
  onColorSpaceChange: (value: TraceColorSpace) => void
  disabled?: boolean
}) {
  const { colorMode, colorSpace, onColorModeChange, onColorSpaceChange, disabled } = props
  return (
    <PanelTwoFieldRow>
      <FormField
        variant="select"
        label="Farbmodus (S/W oder Color)"
        labelVisuallyHidden
        iconStart={<Palette aria-hidden="true" />}
        id="color_mode"
        value={colorMode}
        options={COLOR_MODE_OPTIONS}
        onCommit={(v) => onColorModeChange(v as TraceColorMode)}
        disabled={disabled}
      />
      <FormField
        variant="select"
        label="PDF-Farbraum (RGB oder CMYK)"
        labelVisuallyHidden
        iconStart={<Printer aria-hidden="true" />}
        id="color_space"
        value={colorSpace}
        options={COLOR_SPACE_OPTIONS}
        onCommit={(v) => onColorSpaceChange(v as TraceColorSpace)}
        disabled={disabled}
      />
      <PanelIconSlot />
    </PanelTwoFieldRow>
  )
}
