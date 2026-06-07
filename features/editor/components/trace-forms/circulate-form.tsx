"use client"

/**
 * Form fields for the Circulate trace dialog, three segments (matches the
 * approved spec), laid out with the detail-panel-right primitives:
 *   - "Circle"  — outer ellipse W/H; inner-ellipse checkbox + inner W/H
 *                 (disabled until checked); contour width.
 *   - "Spacing" — left/right; top/bottom (per-axis gaps around the outer
 *                 ellipse, folded into the cell pitch).
 *   - "Colors"  — shared palette mode + max chip count (`TraceColorsFields`)
 *                 plus the inner-ellipse hue shift (disabled until the inner
 *                 ellipse is on).
 *
 * Contour width + hue shift aren't placed by the original 3-segment spec;
 * they live in Circle (it strokes the ellipses) and Colors (it recolours the
 * inner ellipse) respectively — flagged for review.
 *
 * Stateless: parent owns the draft and reacts to `onParamsChange`.
 */
import type { ReactNode } from "react"
import { ArrowLeftRight, ArrowUpDown, Circle, Droplet } from "lucide-react"

import type { z } from "zod"

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { FormField, type SelectFieldOption } from "@/components/ui/form-controls"
import { circulateSchema, type CirculateParams } from "@/lib/editor/trace/circulate"
import { isCirculateGridValid, type CirculateGrid } from "@/lib/editor/trace/circulate-grid-math"
import { INNER_FILTERS } from "@/lib/editor/trace/inner-color-filters"
import { extractNumberInputProps, parseFormNumber } from "@/lib/forms/zod-input-props"

import { PanelIconSlot, PanelTwoFieldRow } from "../panel-layout"
import { EditorSidebarSection } from "../sidebar/editor-sidebar-section"
import { TraceColorsFields } from "./trace-colors-fields"
import { TraceDistanceFields } from "./trace-distance-fields"
import { TracePaletteRestrictionFields } from "./trace-palette-restriction-fields"
import { TraceDitherFields } from "./trace-dither-fields"
import { TraceTextureFields } from "./trace-texture-fields"

// Module-level so the select's `options` reference stays stable across renders.
const INNER_FILTER_OPTIONS: SelectFieldOption[] = INNER_FILTERS.map((f) => ({
  value: f.id,
  label: f.label,
}))

type Props = {
  params: CirculateParams
  onParamsChange: <K extends keyof CirculateParams>(key: K, value: CirculateParams[K]) => void
  disabled: boolean
  grid: CirculateGrid
}

function fmt1(n: number): string {
  return n.toFixed(1)
}

/** A single decimal-mm field in the left slot, with an empty right slot so a
 * lone field stays in the 1fr_1fr_auto grid. */
function loneRow(field: ReactNode) {
  return (
    <PanelTwoFieldRow>
      {field}
      <div aria-hidden="true" />
      <PanelIconSlot />
    </PanelTwoFieldRow>
  )
}

export function CirculateForm({ params, onParamsChange, disabled, grid }: Props) {
  const valid = isCirculateGridValid(grid)
  const innerDisabled = disabled || !params.inner_enabled

  // Min comes from the Zod schema slice for this field; step is a
  // UI-only granularity choice (0.5 mm default, 0.1 mm for contour).
  const mmField = (
    key: keyof CirculateParams,
    label: string,
    icon: ReactNode,
    opts: { disabled?: boolean; step?: number } = {},
  ) => {
    const schemaSlice = circulateSchema.shape[key] as z.ZodTypeAny
    return (
      <FormField
        variant="numeric"
        numericMode="decimal"
        label={label}
        labelVisuallyHidden
        iconStart={icon}
        unit="mm"
        id={key}
        value={String(params[key])}
        onCommit={(raw) => {
          const res = parseFormNumber(schemaSlice, raw)
          if (res.ok) onParamsChange(key, res.value as CirculateParams[typeof key])
        }}
        disabled={opts.disabled ?? disabled}
        inputProps={{ ...extractNumberInputProps(schemaSlice), step: opts.step ?? 0.5 }}
      />
    )
  }

  return (
    <>
      <EditorSidebarSection title="Circle">
        <div className="space-y-3">
          <PanelTwoFieldRow>
            {mmField("outer_width_mm", "Outer width", <ArrowLeftRight aria-hidden="true" />)}
            {mmField("outer_height_mm", "Outer height", <ArrowUpDown aria-hidden="true" />)}
            <PanelIconSlot />
          </PanelTwoFieldRow>

          <div className="flex items-center gap-2">
            <Checkbox
              id="inner_enabled"
              checked={params.inner_enabled}
              onCheckedChange={(c) => onParamsChange("inner_enabled", c === true)}
              disabled={disabled}
            />
            <Label htmlFor="inner_enabled" className="cursor-pointer text-panel font-normal">
              Inner ellipse
            </Label>
          </div>

          <PanelTwoFieldRow>
            {mmField("inner_width_mm", "Inner width", <ArrowLeftRight aria-hidden="true" />, {
              disabled: innerDisabled,
            })}
            {mmField("inner_height_mm", "Inner height", <ArrowUpDown aria-hidden="true" />, {
              disabled: innerDisabled,
            })}
            <PanelIconSlot />
          </PanelTwoFieldRow>

          {loneRow(mmField("contour_width_mm", "Stroke width", <Circle aria-hidden="true" />, { step: 0.1 }))}

          {!valid ? (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-destructive">
              Cell grid too large — no full circle fits the image. Pick a
              smaller ellipse or less spacing.
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              Cut margin: ↔ {fmt1(grid.borderMmX / 2)} mm · ↕ {fmt1(grid.borderMmY / 2)} mm
            </div>
          )}
        </div>
      </EditorSidebarSection>

      <EditorSidebarSection title="Spacing">
        <div className="space-y-3">
          <PanelTwoFieldRow>
            {mmField("spacing_left_mm", "Spacing left", <ArrowLeftRight aria-hidden="true" />)}
            {mmField("spacing_right_mm", "Spacing right", <ArrowLeftRight aria-hidden="true" />)}
            <PanelIconSlot />
          </PanelTwoFieldRow>
          <PanelTwoFieldRow>
            {mmField("spacing_top_mm", "Spacing top", <ArrowUpDown aria-hidden="true" />)}
            {mmField("spacing_bottom_mm", "Spacing bottom", <ArrowUpDown aria-hidden="true" />)}
            <PanelIconSlot />
          </PanelTwoFieldRow>
        </div>
      </EditorSidebarSection>

      <EditorSidebarSection title="Colors">
        <div className="space-y-3">
          <TraceColorsFields
            colorMode={params.color_mode}
            numColors={params.num_colors}
            onColorModeChange={(v) => onParamsChange("color_mode", v)}
            onNumColorsChange={(v) => onParamsChange("num_colors", v)}
            disabled={disabled}
          />
          {loneRow(
            <FormField
              variant="select"
              label="Inner color (sub-color filter)"
              labelVisuallyHidden
              iconStart={<Droplet aria-hidden="true" />}
              id="inner_filter"
              value={params.inner_filter}
              options={INNER_FILTER_OPTIONS}
              onCommit={(v) => onParamsChange("inner_filter", v as CirculateParams["inner_filter"])}
              disabled={innerDisabled}
            />,
          )}
        </div>
      </EditorSidebarSection>

      <EditorSidebarSection title="Distance">
        <TraceDistanceFields
          metric={params.distance_metric}
          onMetricChange={(v) => onParamsChange("distance_metric", v)}
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

      <EditorSidebarSection title="Dither">
        <TraceDitherFields
          mode={params.dither_mode}
          patternSize={params.dither_pattern_size}
          onModeChange={(v) => onParamsChange("dither_mode", v)}
          onPatternSizeChange={(v) => onParamsChange("dither_pattern_size", v)}
          disabled={disabled}
        />
      </EditorSidebarSection>

      <EditorSidebarSection title="Texture">
        <TraceTextureFields
          enabled={params.texture_enabled}
          strength={params.texture_strength}
          onEnabledChange={(v) => onParamsChange("texture_enabled", v)}
          onStrengthChange={(v) => onParamsChange("texture_strength", v)}
          disabled={disabled || params.dither_mode !== "none"}
        />
      </EditorSidebarSection>
    </>
  )
}
