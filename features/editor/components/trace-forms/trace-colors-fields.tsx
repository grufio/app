"use client"

/**
 * Shared "Colors" segment fields for trace dialogs (Pixelate + Circulate).
 *
 * Three controls laid out in the panel grid:
 *   - palette mode (B/W vs Color → `color_mode`, which DB palette the server
 *     snaps cells to)
 *   - cap on distinct chips in the rendered output (`num_colors`, post-snap
 *     top-N reduction)
 *   - pre-snap chroma boost (`pre_snap_chroma_scale`, three-stop select)
 *
 * The shared contract lives here so the two traces can't drift on labels or
 * ids. Each form wraps this in its own `EditorSidebarSection title="Colors"`.
 */
import { Droplets, Layers, Palette } from "lucide-react"

import { FormField, type SelectFieldOption } from "@/components/ui/form-controls"
import { numColorsSchema } from "@/lib/editor/trace/num-colors-schema"
import { extractNumberInputProps, parseFormNumber } from "@/lib/forms/zod-input-props"

import { PanelIconSlot, PanelTwoFieldRow } from "../panel-layout"

export type TraceColorMode = "color" | "bw"

// Module-level so the `options` reference stays stable across renders (the
// select FormField memoises on `prev.options === next.options`).
const COLOR_MODE_OPTIONS: SelectFieldOption[] = [
  { value: "color", label: "Color" },
  { value: "bw", label: "B/W" },
]

// Pre-snap chroma boost stops. The schema (`chroma-scale-schema.ts`) allows
// the full range [1.0, 1.5]; three discrete stops keep the UI simple and
// match how users describe the result ("normal" / "more colorful" / "very
// colorful") rather than a 1.13-vs-1.18 numeric tune.
const CHROMA_SCALE_OPTIONS: SelectFieldOption[] = [
  { value: "1.0", label: "Natural" },
  { value: "1.2", label: "Vivid" },
  { value: "1.5", label: "Saturated" },
]

function chromaScaleToOption(value: number): string {
  // Snap to the nearest stop so a persisted off-stop value (e.g. an old
  // 1.0 draft) still displays a sensible option.
  if (value <= 1.1) return "1.0"
  if (value <= 1.35) return "1.2"
  return "1.5"
}

const NUM_COLORS_INPUT_PROPS = extractNumberInputProps(numColorsSchema)

export function TraceColorsFields(props: {
  colorMode: TraceColorMode
  numColors: number
  preSnapChromaScale: number
  onColorModeChange: (value: TraceColorMode) => void
  onNumColorsChange: (value: number) => void
  onPreSnapChromaScaleChange: (value: number) => void
  disabled?: boolean
}) {
  const {
    colorMode,
    numColors,
    preSnapChromaScale,
    onColorModeChange,
    onNumColorsChange,
    onPreSnapChromaScaleChange,
    disabled,
  } = props
  return (
    <>
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
          onCommit={(raw) => onNumColorsChange(parseFormNumber(numColorsSchema, raw).value)}
          inputProps={NUM_COLORS_INPUT_PROPS}
          disabled={disabled}
        />
        <PanelIconSlot />
      </PanelTwoFieldRow>
      <PanelTwoFieldRow>
        <FormField
          variant="select"
          label="Color saturation"
          labelVisuallyHidden
          iconStart={<Droplets aria-hidden="true" />}
          id="pre_snap_chroma_scale"
          value={chromaScaleToOption(preSnapChromaScale)}
          options={CHROMA_SCALE_OPTIONS}
          onCommit={(v) => onPreSnapChromaScaleChange(Number(v))}
          disabled={disabled}
        />
        <div aria-hidden="true" />
        <PanelIconSlot />
      </PanelTwoFieldRow>
    </>
  )
}
