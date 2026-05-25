"use client"

/**
 * Form fields for the Pixelate trace dialog, laid out with the
 * detail-panel-right primitives (`EditorSidebarSection`,
 * `PanelTwoFieldRow`, `PanelIconSlot`) used by the editor's right
 * panel. Two sections:
 *   - "Pixel" — supercell width + height + (Schnitt-Rand / error)
 *   - "Colors" — palette mode (S/W vs Color) + PDF colour space (RGB/CMYK).
 *     The mode picks which DB palette the server snaps cells to; the colour
 *     space is PDF-only and does not affect detection. (`num_colors` is gone
 *     — colour comes from the palette map.)
 *
 * Stateless: parent owns the draft and reacts to `onParamsChange`.
 */
import { ArrowLeftRight, ArrowUpDown, Palette, Printer } from "lucide-react"

import { FormField, type SelectFieldOption } from "@/components/ui/form-controls"
import { type PixelateParams } from "@/lib/editor/trace/pixelate"
import {
  isPixelateGridValid,
  MIN_SUPERCELL_MM,
  type PixelateGrid,
} from "@/lib/editor/trace/pixelate-grid-math"

import { PanelIconSlot, PanelTwoFieldRow } from "../panel-layout"
import { EditorSidebarSection } from "../sidebar/editor-sidebar-section"

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

type Props = {
  params: PixelateParams
  onParamsChange: <K extends keyof PixelateParams>(key: K, value: PixelateParams[K]) => void
  disabled: boolean
  grid: PixelateGrid
}

function fmt1(n: number): string {
  return n.toFixed(1)
}

export function PixelateForm({ params, onParamsChange, disabled, grid }: Props) {
  const valid = isPixelateGridValid(grid)
  const borderSideMmX = grid.borderMmX / 2
  const borderSideMmY = grid.borderMmY / 2

  return (
    <>
      <EditorSidebarSection title="Pixel">
        <div className="space-y-3">
          <PanelTwoFieldRow>
            <FormField
              variant="numeric"
              numericMode="decimal"
              label="Superpixel-Breite"
              labelVisuallyHidden
              iconStart={<ArrowLeftRight aria-hidden="true" />}
              unit="mm"
              id="supercell_width_mm"
              value={String(params.supercell_width_mm)}
              onCommit={(raw) => {
                const n = Number(raw)
                if (Number.isFinite(n)) onParamsChange("supercell_width_mm", n)
              }}
              disabled={disabled}
              inputProps={{ min: MIN_SUPERCELL_MM, step: 0.5 }}
            />

            <FormField
              variant="numeric"
              numericMode="decimal"
              label="Superpixel-Höhe"
              labelVisuallyHidden
              iconStart={<ArrowUpDown aria-hidden="true" />}
              unit="mm"
              id="supercell_height_mm"
              value={String(params.supercell_height_mm)}
              onCommit={(raw) => {
                const n = Number(raw)
                if (Number.isFinite(n)) onParamsChange("supercell_height_mm", n)
              }}
              disabled={disabled}
              inputProps={{ min: MIN_SUPERCELL_MM, step: 0.5 }}
            />

            <PanelIconSlot />
          </PanelTwoFieldRow>

          {!valid ? (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-destructive">
              Superpixel zu groß — kein ganzer Superpixel passt in das Bild.
              Wähle eine kleinere Superpixel-Breite oder -Höhe.
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              Schnitt-Rand: ↔ {fmt1(borderSideMmX)} mm · ↕ {fmt1(borderSideMmY)} mm
            </div>
          )}
        </div>
      </EditorSidebarSection>

      <EditorSidebarSection title="Colors">
        <PanelTwoFieldRow>
          <FormField
            variant="select"
            label="Farbmodus (S/W oder Color)"
            labelVisuallyHidden
            iconStart={<Palette aria-hidden="true" />}
            id="color_mode"
            value={params.color_mode}
            options={COLOR_MODE_OPTIONS}
            onCommit={(v) => onParamsChange("color_mode", v as PixelateParams["color_mode"])}
            disabled={disabled}
          />
          <FormField
            variant="select"
            label="PDF-Farbraum (RGB oder CMYK)"
            labelVisuallyHidden
            iconStart={<Printer aria-hidden="true" />}
            id="color_space"
            value={params.color_space}
            options={COLOR_SPACE_OPTIONS}
            onCommit={(v) => onParamsChange("color_space", v as PixelateParams["color_space"])}
            disabled={disabled}
          />
          <PanelIconSlot />
        </PanelTwoFieldRow>
      </EditorSidebarSection>
    </>
  )
}
