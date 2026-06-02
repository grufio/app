"use client"

/**
 * Form fields for the Pixelate trace dialog, laid out with the
 * detail-panel-right primitives (`EditorSidebarSection`,
 * `PanelTwoFieldRow`, `PanelIconSlot`) used by the editor's right
 * panel. Two sections:
 *   - "Pixel" — supercell width + height + (cut-margin / error)
 *   - "Colors" — palette mode (S/W vs Color) + PDF colour space (RGB/CMYK).
 *     The mode picks which DB palette the server snaps cells to; the colour
 *     space is PDF-only and does not affect detection. (`num_colors` is gone
 *     — colour comes from the palette map.)
 *
 * Stateless: parent owns the draft and reacts to `onParamsChange`.
 */
import { ArrowLeftRight, ArrowUpDown } from "lucide-react"

import { FormField } from "@/components/ui/form-controls"
import { type PixelateParams } from "@/lib/editor/trace/pixelate"
import {
  isPixelateGridValid,
  MIN_SUPERCELL_MM,
  type PixelateGrid,
} from "@/lib/editor/trace/pixelate-grid-math"

import { PanelIconSlot, PanelTwoFieldRow } from "../panel-layout"
import { EditorSidebarSection } from "../sidebar/editor-sidebar-section"
import { TraceColorsFields } from "./trace-colors-fields"
import { TraceTextureFields } from "./trace-texture-fields"

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
              label="Superpixel width"
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
              label="Superpixel height"
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
              Superpixel too large — no full superpixel fits the image.
              Pick a smaller superpixel width or height.
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              Cut margin: ↔ {fmt1(borderSideMmX)} mm · ↕ {fmt1(borderSideMmY)} mm
            </div>
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

      <EditorSidebarSection title="Texture">
        <TraceTextureFields
          enabled={params.texture_enabled}
          strength={params.texture_strength}
          onEnabledChange={(v) => onParamsChange("texture_enabled", v)}
          onStrengthChange={(v) => onParamsChange("texture_strength", v)}
          disabled={disabled}
        />
      </EditorSidebarSection>
    </>
  )
}
