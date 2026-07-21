"use client"

/**
 * Form fields for the Linerate trace dialog — a "Shape" section (flatten,
 * density, smoothness, radius, min paintable gap) + a shared "Colors" section.
 * Stateless; the parent owns the draft.
 */
import { Blend, Circle, Contrast, Droplets, Grid2x2, Maximize2, Move, Ruler, Wand2, Waves } from "lucide-react"

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

const FLATTEN_ALGO_OPTIONS: SelectFieldOption[] = [
  { value: "l0", label: "L0 (FFT)" },
  { value: "edge_preserving", label: "Edge-preserving" },
]
const EP_FLAG_OPTIONS: SelectFieldOption[] = [
  { value: "recurs", label: "Recursive" },
  { value: "normconv", label: "Norm. conv." },
]
// edge_preserving sigma_s (cv2 spatial reach 10..150) and sigma_r (edge sensitivity
// 0.10..0.50) presented as 1–10 levels, mirroring the 0–1 dials above. The 0..1 unit
// maps into the useful cv2 envelope; the raw sigma is what travels on the wire.
const sigmaSToLevel = (v: number) => unitToLevel((v - 10) / 140)
const levelToSigmaS = (l: number) => 10 + levelToUnit(l) * 140
const sigmaRToLevel = (v: number) => unitToLevel((v - 0.1) / 0.4)
const levelToSigmaR = (l: number) => 0.1 + levelToUnit(l) * 0.4

const RESOLUTION_OPTIONS: SelectFieldOption[] = [
  { value: "1", label: "1 MP" },
  { value: "2", label: "2 MP" },
  { value: "4", label: "4 MP" },
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
              label="Density"
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
              variant="select"
              label="Radius"
              labelVisuallyHidden
              iconStart={<Circle aria-hidden="true" />}
              id="radius"
              value={String(unitToLevel(params.radius))}
              options={LEVEL_OPTIONS}
              onCommit={(v) => onParamsChange("radius", levelToUnit(Number(v)))}
              disabled={disabled}
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

      <EditorSidebarSection title="Algorithm">
        <div className="space-y-3">
          <PanelTwoFieldRow>
            <div className="col-span-2">
              <FormField
                variant="select"
                label="Flatten algorithm"
                labelVisuallyHidden
                iconStart={<Wand2 aria-hidden="true" />}
                id="flatten_algo"
                value={params.flatten_algo}
                options={FLATTEN_ALGO_OPTIONS}
                onCommit={(v) => onParamsChange("flatten_algo", v as LinerateParams["flatten_algo"])}
                disabled={disabled}
              />
            </div>
          </PanelTwoFieldRow>

          {params.flatten_algo === "edge_preserving" && (
            <>
              <PanelTwoFieldRow>
                <FormField
                  variant="select"
                  label="Spatial reach"
                  labelVisuallyHidden
                  iconStart={<Move aria-hidden="true" />}
                  id="sigma_s"
                  value={String(sigmaSToLevel(params.sigma_s))}
                  options={LEVEL_OPTIONS}
                  onCommit={(v) => onParamsChange("sigma_s", levelToSigmaS(Number(v)))}
                  disabled={disabled}
                />
                <FormField
                  variant="select"
                  label="Edge sensitivity"
                  labelVisuallyHidden
                  iconStart={<Contrast aria-hidden="true" />}
                  id="sigma_r"
                  value={String(sigmaRToLevel(params.sigma_r))}
                  options={LEVEL_OPTIONS}
                  onCommit={(v) => onParamsChange("sigma_r", levelToSigmaR(Number(v)))}
                  disabled={disabled}
                />
                <PanelIconSlot />
              </PanelTwoFieldRow>

              <PanelTwoFieldRow>
                <div className="col-span-2">
                  <FormField
                    variant="select"
                    label="Filter variant"
                    labelVisuallyHidden
                    iconStart={<Blend aria-hidden="true" />}
                    id="ep_flag"
                    value={params.ep_flag}
                    options={EP_FLAG_OPTIONS}
                    onCommit={(v) => onParamsChange("ep_flag", v as LinerateParams["ep_flag"])}
                    disabled={disabled}
                  />
                </div>
              </PanelTwoFieldRow>
            </>
          )}
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
              value={String(params.resolution)}
              options={RESOLUTION_OPTIONS}
              onCommit={(v) => onParamsChange("resolution", Number(v) as LinerateParams["resolution"])}
              disabled={disabled}
            />
          </div>
        </PanelTwoFieldRow>
      </EditorSidebarSection>
    </>
  )
}
