"use client"

/**
 * Form fields for the Linerate trace dialog — same layout + primitives as
 * `LineArtForm` (its sibling): a "Shape" section (line thickness, flatten,
 * detail, smoothness, min paintable gap) + a shared "Colors" section.
 * Stateless; the parent owns the draft.
 */
import { Brush, Droplets, Grid2x2, Ruler, Waves } from "lucide-react"

import { FormField } from "@/components/ui/form-controls"
import { linerateSchema, type LinerateParams } from "@/lib/editor/trace/linerate"
import { extractNumberInputProps, parseFormNumber } from "@/lib/forms/zod-input-props"

import { PanelIconSlot, PanelTwoFieldRow } from "../panel-layout"
import { EditorSidebarSection } from "../sidebar/editor-sidebar-section"
import { TraceColorsFields } from "./trace-colors-fields"

type Props = {
  params: LinerateParams
  onParamsChange: <K extends keyof LinerateParams>(key: K, value: LinerateParams[K]) => void
  disabled: boolean
}

const LINE_THICKNESS_INPUT_PROPS = extractNumberInputProps(linerateSchema.shape.line_thickness)
const FLATTEN_INPUT_PROPS = extractNumberInputProps(linerateSchema.shape.flatten)
const DETAIL_INPUT_PROPS = extractNumberInputProps(linerateSchema.shape.detail)
const SMOOTHNESS_INPUT_PROPS = extractNumberInputProps(linerateSchema.shape.smoothness)
const MIN_PAINTABLE_INPUT_PROPS = extractNumberInputProps(linerateSchema.shape.min_paintable_mm)

export function LinerateForm({ params, onParamsChange, disabled }: Props) {
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
                const res = parseFormNumber(linerateSchema.shape.line_thickness, raw)
                if (res.ok) onParamsChange("line_thickness", res.value)
              }}
              disabled={disabled}
              inputProps={LINE_THICKNESS_INPUT_PROPS}
            />
            <FormField
              variant="numeric"
              numericMode="decimal"
              label="Flatten"
              labelVisuallyHidden
              iconStart={<Droplets aria-hidden="true" />}
              id="flatten"
              value={String(params.flatten)}
              onCommit={(raw) => {
                const res = parseFormNumber(linerateSchema.shape.flatten, raw)
                if (res.ok) onParamsChange("flatten", res.value)
              }}
              disabled={disabled}
              inputProps={FLATTEN_INPUT_PROPS}
            />
            <PanelIconSlot />
          </PanelTwoFieldRow>

          <PanelTwoFieldRow>
            <FormField
              variant="numeric"
              numericMode="decimal"
              label="Detail"
              labelVisuallyHidden
              iconStart={<Grid2x2 aria-hidden="true" />}
              id="detail"
              value={String(params.detail)}
              onCommit={(raw) => {
                const res = parseFormNumber(linerateSchema.shape.detail, raw)
                if (res.ok) onParamsChange("detail", res.value)
              }}
              disabled={disabled}
              inputProps={DETAIL_INPUT_PROPS}
            />
            <FormField
              variant="numeric"
              numericMode="decimal"
              label="Smoothness"
              labelVisuallyHidden
              iconStart={<Waves aria-hidden="true" />}
              id="smoothness"
              value={String(params.smoothness)}
              onCommit={(raw) => {
                const res = parseFormNumber(linerateSchema.shape.smoothness, raw)
                if (res.ok) onParamsChange("smoothness", res.value)
              }}
              disabled={disabled}
              inputProps={SMOOTHNESS_INPUT_PROPS}
            />
            <PanelIconSlot />
          </PanelTwoFieldRow>

          <PanelTwoFieldRow>
            <FormField
              variant="numeric"
              numericMode="decimal"
              label="Min. paintable gap"
              labelVisuallyHidden
              iconStart={<Ruler aria-hidden="true" />}
              unit="mm"
              id="min_paintable_mm"
              value={String(params.min_paintable_mm)}
              onCommit={(raw) => {
                const res = parseFormNumber(linerateSchema.shape.min_paintable_mm, raw)
                if (res.ok) onParamsChange("min_paintable_mm", res.value)
              }}
              disabled={disabled}
              inputProps={MIN_PAINTABLE_INPUT_PROPS}
            />
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
