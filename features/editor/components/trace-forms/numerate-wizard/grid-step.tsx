import type { ReactNode } from "react"

import { FormField } from "@/components/ui/form-controls"
import { cn } from "@/lib/utils"
import type { NumerateParams } from "@/lib/editor/trace/numerate"
import {
  gridFromCells,
  MAX_CELLS_PER_AXIS,
  MAX_SUPERPIXEL_TOTAL_CELLS,
  type GridStats,
} from "@/lib/editor/trace/numerate-grid-math"

export type GridMode = "cells" | "superpixel"

export function GridStep(props: {
  imageWidth: number
  imageHeight: number
  gridMode: GridMode
  onGridModeChange: (mode: GridMode) => void
  draft: NumerateParams
  setField: <K extends keyof NumerateParams>(key: K, value: NumerateParams[K]) => void
  grid: GridStats
  busy: boolean
}) {
  const { imageWidth, imageHeight, gridMode, onGridModeChange, draft, setField, grid, busy } = props

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
  const onSuperWCommit = (raw: string) => {
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0.1) return
    setField("superpixel_width", n)
  }
  const onSuperHCommit = (raw: string) => {
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0.1) return
    setField("superpixel_height", n)
  }

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
              label="Superpixel Width (px)"
              id="superpixel_width"
              value={formatPitch(draft.superpixel_width)}
              onCommit={onSuperWCommit}
              onDraftChange={onSuperWCommit}
              disabled={busy}
              inputProps={{ min: 0.1, max: imageWidth, step: 0.01 }}
            />
            <FormField
              variant="numeric"
              numericMode="decimal"
              label="Superpixel Height (px)"
              id="superpixel_height"
              value={formatPitch(draft.superpixel_height)}
              onCommit={onSuperHCommit}
              onDraftChange={onSuperHCommit}
              disabled={busy}
              inputProps={{ min: 0.1, max: imageHeight, step: 0.01 }}
            />
          </>
        )}
      </div>

      <GridSummary grid={grid} mode={gridMode} />
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

function GridSummary(props: { grid: GridStats; mode: GridMode }) {
  const { grid, mode } = props
  const derivedLabel =
    mode === "cells"
      ? `Superpixel: ${formatPitch(grid.superpixelWidth)} × ${formatPitch(grid.superpixelHeight)} px`
      : `Cells: ${grid.cellsX} × ${grid.cellsY}`
  // Cells mode is hard-capped at MAX_CELLS_PER_AXIS, so totalCells can
  // only exceed the soft cap via the pitch-driven superpixel mode.
  const overSoftCap = grid.totalCells > MAX_SUPERPIXEL_TOTAL_CELLS
  return (
    <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
      <div>{derivedLabel}</div>
      <div>Total cells: {grid.totalCells}</div>
      {overSoftCap ? (
        <div className="mt-1 text-amber-600 dark:text-amber-500">
          Over {MAX_SUPERPIXEL_TOTAL_CELLS} cells — the trace will be large and slow to render.
        </div>
      ) : null}
    </div>
  )
}
