"use client"

/**
 * Shared "Colors" segment fields for trace dialogs (Pixelate + Circulate).
 *
 * Two controls laid out in the panel grid:
 *   - palette mode (B/W vs Color → `color_mode`, which DB palette the server
 *     snaps cells to)
 *   - cap on distinct chips in the rendered output (`num_colors`, post-snap
 *     top-N reduction)
 *
 * The shared contract lives here so the two traces can't drift on labels or
 * ids. Each form wraps this in its own `EditorSidebarSection title="Colors"`.
 *
 * `pre_snap_chroma_scale` was a three-stop "Color saturation" selector
 * in #400 with a 1.2 default. Investigation against the user's actual
 * source images showed the boost was suboptimal for typical warm-beige
 * content (it pushed already-warm cell-means further from the gray
 * ramp). The trace pipeline is being reworked end-to-end with
 * established quantization + dithering algorithms; this selector is
 * removed as part of the cleanup. The schema field still exists for
 * backward compatibility (default now 1.0 = no-op) so persisted rows
 * carrying an explicit `1.2` still parse.
 */
import { Layers, Palette } from "lucide-react"

import { FormField, type SelectFieldOption } from "@/components/ui/form-controls"
import { numColorsDialogSchema } from "@/lib/editor/trace/num-colors-schema"
import { extractNumberInputProps, parseFormNumber } from "@/lib/forms/zod-input-props"

import { PanelIconSlot, PanelTwoFieldRow } from "../panel-layout"

export type TraceColorMode = "color" | "bw"

// Module-level so the `options` reference stays stable across renders (the
// select FormField memoises on `prev.options === next.options`).
const COLOR_MODE_OPTIONS: SelectFieldOption[] = [
  { value: "color", label: "Color" },
  { value: "bw", label: "B/W" },
]

// Bind the dialog control to the dialog schema (max = NUM_COLORS_DIALOG_MAX):
// the input props AND the commit-time clamp both cap at the dialog max, so the
// dialog can't emit a budget above it — the wider validation cap only applies
// to non-dialog paths.
const NUM_COLORS_INPUT_PROPS = extractNumberInputProps(numColorsDialogSchema)

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
        onCommit={(raw) => onNumColorsChange(parseFormNumber(numColorsDialogSchema, raw).value)}
        inputProps={NUM_COLORS_INPUT_PROPS}
        disabled={disabled}
      />
      <PanelIconSlot />
    </PanelTwoFieldRow>
  )
}
