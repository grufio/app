"use client"

/**
 * Form fields for the Line Art trace dialog, laid out with the
 * detail-panel-right primitives (`EditorSidebarSection`,
 * `PanelTwoFieldRow`, `PanelIconSlot`) used by Pixelate / Circulate.
 * Two sections:
 *   - "Shape" — line thickness + pre-trace blur + edge smoothness
 *   - "Colors" — palette mode (B/W vs Color) + region cap
 *     (shared `TraceColorsFields`)
 *
 * Stateless: parent owns the draft and reacts to `onParamsChange`.
 */
import { Brush, CircleDashed, Waves } from "lucide-react"

import { FormField } from "@/components/ui/form-controls"
import { lineartSchema, type LineartParams } from "@/lib/editor/trace/lineart"
import { extractNumberInputProps, parseFormNumber } from "@/lib/forms/zod-input-props"

import { PanelIconSlot, PanelTwoFieldRow } from "../panel-layout"
import { EditorSidebarSection } from "../sidebar/editor-sidebar-section"
import { TraceColorsFields } from "./trace-colors-fields"

type Props = {
  params: LineartParams
  onParamsChange: <K extends keyof LineartParams>(key: K, value: LineartParams[K]) => void
  disabled: boolean
}

const LINE_THICKNESS_INPUT_PROPS = extractNumberInputProps(lineartSchema.shape.line_thickness)
const BLUR_AMOUNT_INPUT_PROPS = extractNumberInputProps(lineartSchema.shape.blur_amount)
const SMOOTHNESS_INPUT_PROPS = extractNumberInputProps(lineartSchema.shape.smoothness)

export function LineArtForm({ params, onParamsChange, disabled }: Props) {
  return (
    <>
      <EditorSidebarSection title="Shape">
        <div className="space-y-3">
          <PanelTwoFieldRow>
            <FormField
              variant="numeric"
              numericMode="decimal"
              label="Line thickness"
              labelVisuallyHidden
              iconStart={<Brush aria-hidden="true" />}
              unit="px"
              id="line_thickness"
              value={String(params.line_thickness)}
              onCommit={(raw) => {
                const res = parseFormNumber(lineartSchema.shape.line_thickness, raw)
                if (res.ok) onParamsChange("line_thickness", res.value)
              }}
              disabled={disabled}
              inputProps={LINE_THICKNESS_INPUT_PROPS}
            />
            <FormField
              variant="numeric"
              numericMode="int"
              label="Blur amount"
              labelVisuallyHidden
              iconStart={<CircleDashed aria-hidden="true" />}
              id="blur_amount"
              value={String(params.blur_amount)}
              onCommit={(raw) => {
                const res = parseFormNumber(lineartSchema.shape.blur_amount, raw)
                if (res.ok) onParamsChange("blur_amount", res.value)
              }}
              disabled={disabled}
              inputProps={BLUR_AMOUNT_INPUT_PROPS}
            />
            <PanelIconSlot />
          </PanelTwoFieldRow>

          <PanelTwoFieldRow>
            <FormField
              variant="numeric"
              numericMode="decimal"
              label="Smoothness"
              labelVisuallyHidden
              iconStart={<Waves aria-hidden="true" />}
              id="smoothness"
              value={String(params.smoothness)}
              onCommit={(raw) => {
                const res = parseFormNumber(lineartSchema.shape.smoothness, raw)
                if (res.ok) onParamsChange("smoothness", res.value)
              }}
              disabled={disabled}
              inputProps={SMOOTHNESS_INPUT_PROPS}
            />
            <div aria-hidden="true" />
            <PanelIconSlot />
          </PanelTwoFieldRow>
        </div>
      </EditorSidebarSection>

      <EditorSidebarSection title="Colors">
        <TraceColorsFields
          colorMode={params.color_mode}
          numColors={params.num_colors}
          onColorModeChange={(v) => onParamsChange("color_mode", v)}
          onNumColorsChange={(v) => onParamsChange("num_colors", v)}
          disabled={disabled}
        />
      </EditorSidebarSection>
    </>
  )
}
