import type { ReactNode } from "react"

import { FormField } from "@/components/ui/form-controls"
import { cn } from "@/lib/utils"
import type { NumerateParams } from "@/lib/editor/trace/numerate"
import {
  gridFromCells,
  MAX_CELLS_PER_AXIS,
  MAX_SUPERPIXEL_TOTAL_CELLS,
  MIN_SUPERCELL_MM,
  type GridStats,
} from "@/lib/editor/trace/numerate-grid-math"
import { pxToUnit, unitToPx } from "@/lib/editor/units"

export type GridMode = "cells" | "superpixel"

export function GridStep(props: {
  imageWidth: number
  imageHeight: number
  /** Project output DPI — converts the supercell pitch (image px) to
   * mm for the MIN_SUPERCELL_MM check. `null` while workspace loads. */
  dpi: number | null
  gridMode: GridMode
  onGridModeChange: (mode: GridMode) => void
  draft: NumerateParams
  setField: <K extends keyof NumerateParams>(key: K, value: NumerateParams[K]) => void
  grid: GridStats
  busy: boolean
}) {
  const { imageWidth, imageHeight, dpi, gridMode, onGridModeChange, draft, setField, grid, busy } = props

  const onCellsXCommit = (raw: string) => {
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 1) return
    const next = gridFromCells(imageWidth, imageHeight, n, grid.cellsY)
    setField("superpixel_width", next.superpixelWidth)
  }
  const onCellsYCommit = (raw: string) => {
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 1) return
    const next = gridFromCells(imageWidth, imageHeight, grid.cellsX, n)
    setField("superpixel_height", next.superpixelHeight)
  }
  // Superpixel mode is mm-based: superpixel_width/_height are stored
  // in image px (the API unit), so convert mm -> px on commit and
  // px -> mm for display, using the project DPI.
  const onSuperWCommit = (raw: string) => {
    const mm = Number(raw)
    if (!Number.isFinite(mm) || mm <= 0 || dpi == null) return
    setField("superpixel_width", unitToPx(mm, "mm", dpi))
  }
  const onSuperHCommit = (raw: string) => {
    const mm = Number(raw)
    if (!Number.isFinite(mm) || mm <= 0 || dpi == null) return
    setField("superpixel_height", unitToPx(mm, "mm", dpi))
  }
  const imageWidthMm = dpi != null ? pxToUnit(imageWidth, "mm", dpi) : undefined
  const imageHeightMm = dpi != null ? pxToUnit(imageHeight, "mm", dpi) : undefined

  return (
    <div className="flex flex-col gap-5">
      <div className="text-xs text-muted-foreground">
        Image: {imageWidth} × {imageHeight} px
      </div>

      <div className="flex items-center gap-2 text-xs">
        <ModeTab active={gridMode === "cells"} onClick={() => onGridModeChange("cells")}>
          Number of cells
        </ModeTab>
        <ModeTab active={gridMode === "superpixel"} onClick={() => onGridModeChange("superpixel")}>
          Superpixel size
        </ModeTab>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {gridMode === "cells" ? (
          <>
            <FormField
              variant="numeric"
              numericMode="int"
              label="Cells horizontal"
              id="cells_x"
              value={String(grid.cellsX)}
              onCommit={onCellsXCommit}
              onDraftChange={onCellsXCommit}
              disabled={busy}
              inputProps={{ min: 1, max: MAX_CELLS_PER_AXIS }}
            />
            <FormField
              variant="numeric"
              numericMode="int"
              label="Cells vertical"
              id="cells_y"
              value={String(grid.cellsY)}
              onCommit={onCellsYCommit}
              onDraftChange={onCellsYCommit}
              disabled={busy}
              inputProps={{ min: 1, max: MAX_CELLS_PER_AXIS }}
            />
          </>
        ) : (
          <>
            <FormField
              variant="numeric"
              numericMode="decimal"
              label="Supercell Width (mm)"
              id="superpixel_width"
              value={dpi != null ? formatPitch(pxToUnit(draft.superpixel_width, "mm", dpi)) : ""}
              onCommit={onSuperWCommit}
              onDraftChange={onSuperWCommit}
              disabled={busy || dpi == null}
              inputProps={{ min: 0.1, max: imageWidthMm, step: 0.1 }}
            />
            <FormField
              variant="numeric"
              numericMode="decimal"
              label="Supercell Height (mm)"
              id="superpixel_height"
              value={dpi != null ? formatPitch(pxToUnit(draft.superpixel_height, "mm", dpi)) : ""}
              onCommit={onSuperHCommit}
              onDraftChange={onSuperHCommit}
              disabled={busy || dpi == null}
              inputProps={{ min: 0.1, max: imageHeightMm, step: 0.1 }}
            />
          </>
        )}
      </div>

      <GridSummary grid={grid} mode={gridMode} dpi={dpi} />
    </div>
  )
}

export function formatPitch(n: number): string {
  // 2-decimal display for fractional pitch; integer values render
  // without trailing zeros so the common 100×100 case still reads cleanly.
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(2)
}

function ModeTab(props: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cn(
        "rounded-md border px-2 py-1 text-xs transition-colors",
        props.active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {props.children}
    </button>
  )
}

function GridSummary(props: { grid: GridStats; mode: GridMode; dpi: number | null }) {
  const { grid, mode, dpi } = props
  // Physical supercell size — needs the project DPI. Below
  // MIN_SUPERCELL_MM the grid step is invalid and Apply is blocked
  // (see step-validation.ts); surface the size + reason here.
  const supercellWidthMm = dpi != null ? pxToUnit(grid.superpixelWidth, "mm", dpi) : null
  const supercellHeightMm = dpi != null ? pxToUnit(grid.superpixelHeight, "mm", dpi) : null
  const derivedLabel =
    mode === "cells"
      ? supercellWidthMm != null && supercellHeightMm != null
        ? `Supercell: ${formatPitch(supercellWidthMm)} × ${formatPitch(supercellHeightMm)} mm`
        : `Supercell: ${formatPitch(grid.superpixelWidth)} × ${formatPitch(grid.superpixelHeight)} px`
      : `Cells: ${grid.cellsX} × ${grid.cellsY}`
  const belowMinSize =
    supercellWidthMm != null &&
    supercellHeightMm != null &&
    (supercellWidthMm < MIN_SUPERCELL_MM || supercellHeightMm < MIN_SUPERCELL_MM)
  // Cells mode is hard-capped at MAX_CELLS_PER_AXIS, so totalCells can
  // only exceed the soft cap via the pitch-driven superpixel mode.
  const overSoftCap = grid.totalCells > MAX_SUPERPIXEL_TOTAL_CELLS
  return (
    <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
      <div>{derivedLabel}</div>
      <div>Total cells: {grid.totalCells}</div>
      {belowMinSize ? (
        <div className="mt-1 text-destructive">
          Supercell must be at least {MIN_SUPERCELL_MM} mm per side — increase the
          supercell size or reduce the cell count to enable Apply.
        </div>
      ) : null}
      {overSoftCap ? (
        <div className="mt-1 text-amber-600 dark:text-amber-500">
          Over {MAX_SUPERPIXEL_TOTAL_CELLS} cells — the trace will be large and slow to render.
        </div>
      ) : null}
    </div>
  )
}
