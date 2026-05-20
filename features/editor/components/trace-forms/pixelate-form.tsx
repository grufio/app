"use client"

/**
 * Form fields for the Pixelate trace dialog, laid out with the
 * detail-panel-right primitives (`EditorSidebarSection`,
 * `PanelTwoFieldRow`, `PanelIconSlot`) used by the editor's right
 * panel. Two sections:
 *   - "Pixel" — supercell width + height + (Schnitt-Rand / error)
 *   - "Farben" — num_colors
 *
 * Stateless: parent owns the draft and reacts to `onParamsChange`.
 */
import { ArrowLeftRight, ArrowUpDown, Palette } from "lucide-react"

import { FormField } from "@/components/ui/form-controls"
import { type PixelateParams } from "@/lib/editor/trace/pixelate"
import {
  isPixelateGridValid,
  MIN_SUPERCELL_MM,
  type PixelateGrid,
} from "@/lib/editor/trace/pixelate-grid-math"

import { PanelIconSlot, PanelTwoFieldRow } from "../panel-layout"
import { EditorSidebarSection } from "../sidebar/editor-sidebar-section"

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

      <EditorSidebarSection title="Farben">
        <PanelTwoFieldRow>
          <FormField
            variant="numeric"
            numericMode="int"
            label="Anzahl Farben"
            labelVisuallyHidden
            iconStart={<Palette aria-hidden="true" />}
            id="num_colors"
            value={String(params.num_colors)}
            onCommit={(raw) => {
              const n = Number(raw)
              if (Number.isFinite(n)) onParamsChange("num_colors", Math.floor(n))
            }}
            disabled={disabled}
            inputProps={{ min: 2, max: 256 }}
          />
          {/* Empty 2nd column placeholder so the lone field stays in
              the left slot of the 1fr_1fr_auto grid. */}
          <div aria-hidden="true" />
          <PanelIconSlot />
        </PanelTwoFieldRow>
      </EditorSidebarSection>
    </>
  )
}
