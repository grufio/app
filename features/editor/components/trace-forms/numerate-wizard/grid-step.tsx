import type { ReactNode } from "react"

import { FormField } from "@/components/ui/form-controls"
import { cn } from "@/lib/utils"
import type { NumerateParams } from "@/lib/editor/trace/numerate"
import {
  isNumerateGridValid,
  MIN_SUPERCELL_MM,
  type MultipleAxis,
  type NumerateGrid,
} from "@/lib/editor/trace/numerate-grid-math"

export function GridStep(props: {
  imageWidth: number
  imageHeight: number
  draft: NumerateParams
  setField: <K extends keyof NumerateParams>(key: K, value: NumerateParams[K]) => void
  /** The grid resolved from `draft` + image dims — single source of
   * truth, shared with validation and the server. */
  grid: NumerateGrid
  busy: boolean
}) {
  const { imageWidth, imageHeight, draft, setField, grid, busy } = props

  const onSupercellCommit = (raw: string) => {
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0) setField("supercell_mm", n)
  }
  const onMultipleCommit = (raw: string) => {
    const n = Number(raw)
    if (Number.isFinite(n) && n >= 1) setField("multiple", Math.floor(n))
  }
  const onPrimaryCountCommit = (raw: string) => {
    const n = Number(raw)
    if (Number.isFinite(n) && n >= 1) setField("primary_count", Math.floor(n))
  }

  const primaryLabel = grid.primaryAxis === "horizontal" ? "horizontal" : "vertical"

  return (
    <div className="flex flex-col gap-5">
      <div className="text-xs text-muted-foreground">
        Image: {imageWidth} × {imageHeight} px — primary axis: {primaryLabel}
      </div>

      <FormField
        variant="numeric"
        numericMode="decimal"
        label="Supercell size (mm)"
        id="supercell_mm"
        value={String(draft.supercell_mm)}
        onCommit={onSupercellCommit}
        onDraftChange={onSupercellCommit}
        disabled={busy}
        inputProps={{ min: MIN_SUPERCELL_MM, step: 0.5 }}
        description={`The square base cell. Minimum ${MIN_SUPERCELL_MM} mm.`}
      />

      <div className="flex flex-col gap-2">
        <div className="text-xs text-muted-foreground">Stretch the supercell on one axis</div>
        <div className="flex items-center gap-2 text-xs">
          {(["none", "horizontal", "vertical"] as const).map((axis) => (
            <AxisTab
              key={axis}
              active={draft.multiple_axis === axis}
              onClick={() => setField("multiple_axis", axis as MultipleAxis)}
              disabled={busy}
            >
              {axis === "none" ? "Square" : axis === "horizontal" ? "Wider" : "Taller"}
            </AxisTab>
          ))}
        </div>
        {draft.multiple_axis !== "none" ? (
          <FormField
            variant="numeric"
            numericMode="int"
            label="Stretch factor"
            id="multiple"
            value={String(draft.multiple)}
            onCommit={onMultipleCommit}
            onDraftChange={onMultipleCommit}
            disabled={busy}
            inputProps={{ min: 1 }}
          />
        ) : null}
      </div>

      <FormField
        variant="numeric"
        numericMode="int"
        label={`Cells (${primaryLabel} — the exact count)`}
        id="primary_count"
        value={String(draft.primary_count)}
        onCommit={onPrimaryCountCommit}
        onDraftChange={onPrimaryCountCommit}
        disabled={busy}
        inputProps={{ min: 1 }}
        description="The other axis derives from the image format; leftover becomes a centred border."
      />

      <GridSummary grid={grid} />
    </div>
  )
}

function AxisTab(props: {
  active: boolean
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className={cn(
        "rounded-md border px-2 py-1 text-xs transition-colors disabled:opacity-50",
        props.active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {props.children}
    </button>
  )
}

function GridSummary(props: { grid: NumerateGrid }) {
  const { grid } = props
  const valid = isNumerateGridValid(grid)
  return (
    <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
      <div>
        Grid: {grid.cellsX} × {grid.cellsY} cells
      </div>
      <div>
        Cell: {grid.cellMmW} × {grid.cellMmH} mm
      </div>
      {grid.borderPx > 0 ? (
        <div className="text-muted-foreground">
          Border: {Math.round(grid.borderPx)} px on the {grid.primaryAxis === "horizontal" ? "vertical" : "horizontal"} axis
          (centred — the format does not divide evenly)
        </div>
      ) : null}
      {!valid ? (
        <div className="mt-1 text-destructive">
          No whole cell fits — reduce the supercell size or the stretch factor, or
          raise the cell count, to enable Apply.
        </div>
      ) : null}
    </div>
  )
}
