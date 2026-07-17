"use client"

/**
 * Form fields for the Linerate trace dialog — a "Shape" section (line
 * thickness, flatten, detail, smoothness, min paintable gap) + a shared
 * "Colors" section.
 * Stateless; the parent owns the draft.
 */
import { Droplets, Grid2x2, Maximize2, Ruler, Waves } from "lucide-react"

import { FormField, type SelectFieldOption } from "@/components/ui/form-controls"
import { LINERATE_LEVELS, levelToUnit, linerateSchema, unitToLevel, type LinerateParams } from "@/lib/editor/trace/linerate"
import { extractNumberInputProps, parseFormNumber } from "@/lib/forms/zod-input-props"

import { PanelIconSlot, PanelTwoFieldRow } from "../panel-layout"
import { EditorSidebarSection } from "../sidebar/editor-sidebar-section"
import { TraceColorsFields } from "./trace-colors-fields"
import { TracePaletteRestrictionFields } from "./trace-palette-restriction-fields"

type Props = {
  params: LinerateParams
  onParamsChange: <K extends keyof LinerateParams>(key: K, value: LinerateParams[K]) => void
  disabled: boolean
}

const MIN_PAINTABLE_INPUT_PROPS = extractNumberInputProps(linerateSchema.shape.min_paintable_mm)

// Flatten / Detail / Smoothness present their 0–1 float as a 1–10 level.
// Module-level so the `options` reference stays stable across renders (the
// select FormField memoises on `prev.options === next.options`).
const LEVEL_OPTIONS: SelectFieldOption[] = LINERATE_LEVELS.map((l) => ({ value: String(l), label: String(l) }))

const RESOLUTION_OPTIONS: SelectFieldOption[] = [
  { value: "low", label: "Low (640)" },
  { value: "medium", label: "Medium (720)" },
  { value: "high", label: "High (960)" },
]

export function LinerateForm({ params, onParamsChange, disabled }: Props) {
  return (
    <>
      <EditorSidebarSection title="Shape">
        <div className="space-y-3">
          <PanelTwoFieldRow>
            <FormField
              variant="select"
              label="Flatten"
              labelVisuallyHidden
              iconStart={<Droplets aria-hidden="true" />}
              id="flatten"
              value={String(unitToLevel(params.flatten))}
              options={LEVEL_OPTIONS}
              onCommit={(v) => onParamsChange("flatten", levelToUnit(Number(v)))}
              disabled={disabled}
            />
            <FormField
              variant="select"
              label="Detail"
              labelVisuallyHidden
              iconStart={<Grid2x2 aria-hidden="true" />}
              id="detail"
              value={String(unitToLevel(params.detail))}
              options={LEVEL_OPTIONS}
              onCommit={(v) => onParamsChange("detail", levelToUnit(Number(v)))}
              disabled={disabled}
            />
            <PanelIconSlot />
          </PanelTwoFieldRow>

          <PanelTwoFieldRow>
            <FormField
              variant="select"
              label="Smoothness"
              labelVisuallyHidden
              iconStart={<Waves aria-hidden="true" />}
              id="smoothness"
              value={String(unitToLevel(params.smoothness))}
              options={LEVEL_OPTIONS}
              onCommit={(v) => onParamsChange("smoothness", levelToUnit(Number(v)))}
              disabled={disabled}
            />
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

      <EditorSidebarSection title="Palette cap">
        <TracePaletteRestrictionFields
          restriction={params.palette_restriction}
          onRestrictionChange={(v) => onParamsChange("palette_restriction", v)}
          disabled={disabled}
        />
      </EditorSidebarSection>

      <EditorSidebarSection title="Resolution">
        <PanelTwoFieldRow>
          <div className="col-span-2">
            <FormField
              variant="select"
              label="Resolution"
              labelVisuallyHidden
              iconStart={<Maximize2 aria-hidden="true" />}
              id="resolution"
              value={params.resolution}
              options={RESOLUTION_OPTIONS}
              onCommit={(v) => onParamsChange("resolution", v as LinerateParams["resolution"])}
              disabled={disabled}
            />
          </div>
        </PanelTwoFieldRow>
      </EditorSidebarSection>
    </>
  )
}
