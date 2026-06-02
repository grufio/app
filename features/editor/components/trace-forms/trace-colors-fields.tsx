"use client"

/**
 * Shared "Colors" segment fields for trace dialogs (Pixelate + Circulate).
 *
 * Two controls laid out in the panel grid: the palette mode (B/W vs Color →
 * `color_mode`, which DB palette the server snaps cells to) and the cap on
 * distinct chips in the rendered output (`num_colors`, post-snap top-N
 * reduction). The shared contract lives here so the two traces can't drift
 * on labels or ids. Each form wraps this in its own
 * `EditorSidebarSection title="Colors"`.
 */
import { Layers, Palette } from "lucide-react"

import { FormField, type SelectFieldOption } from "@/components/ui/form-controls"

import { PanelIconSlot, PanelTwoFieldRow } from "../panel-layout"

export type TraceColorMode = "color" | "bw"

export const NUM_COLORS_MIN = 2
export const NUM_COLORS_MAX = 32
export const NUM_COLORS_DEFAULT = 16

// Module-level so the `options` reference stays stable across renders (the
// select FormField memoises on `prev.options === next.options`).
const COLOR_MODE_OPTIONS: SelectFieldOption[] = [
  { value: "color", label: "Color" },
  { value: "bw", label: "B/W" },
]

export function TraceColorsFields(props: {
  colorMode: TraceColorMode
  numColors: number
  onColorModeChange: (value: TraceColorMode) => void
  onNumColorsChange: (value: number) => void
  disabled?: boolean
}) {
  const { colorMode, numColors, onColorModeChange, onNumColorsChange, disabled } = props
  return (
    <PanelTwoFieldRow>
      <FormField
        variant="select"
        label="Color mode (B/W or color)"
        labelVisuallyHidden
        iconStart={<Palette aria-hidden="true" />}
        id="color_mode"
        value={colorMode}
        options={COLOR_MODE_OPTIONS}
        onCommit={(v) => onColorModeChange(v as TraceColorMode)}
        disabled={disabled}
      />
      <FormField
        variant="numeric"
        numericMode="int"
        label="Maximum number of colors"
        labelVisuallyHidden
        iconStart={<Layers aria-hidden="true" />}
        id="num_colors"
        value={String(numColors)}
        onCommit={(raw) => {
          const parsed = Number.parseInt(raw, 10)
          if (!Number.isFinite(parsed)) {
            onNumColorsChange(NUM_COLORS_DEFAULT)
            return
          }
          const clamped = Math.min(
            NUM_COLORS_MAX,
            Math.max(NUM_COLORS_MIN, parsed),
          )
          onNumColorsChange(clamped)
        }}
        inputProps={{ min: NUM_COLORS_MIN, max: NUM_COLORS_MAX, step: 1 }}
        disabled={disabled}
      />
      <PanelIconSlot />
    </PanelTwoFieldRow>
  )
}
