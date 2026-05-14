import { Asterisk, Hash, Scaling, Square } from "lucide-react"

import { FormField } from "@/components/ui/form-controls"
import type { NumerateParams } from "@/lib/editor/trace/numerate"
import {
  isNumerateGridValid,
  MIN_SUPERCELL_MM,
  type MultipleAxis,
  type NumerateGrid,
} from "@/lib/editor/trace/numerate-grid-math"

// Module-level icon nodes — stable identity for the FormField memo.
const ICON_SUPERCELL = <Square aria-hidden="true" />
const ICON_SHAPE = <Scaling aria-hidden="true" />
const ICON_FACTOR = <Asterisk aria-hidden="true" />
const ICON_COUNT = <Hash aria-hidden="true" />

const SHAPE_OPTIONS = [
  { value: "none", label: "Square cells" },
  { value: "horizontal", label: "Wider cells" },
  { value: "vertical", label: "Taller cells" },
]

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
  const primaryLabel = grid.primaryAxis === "horizontal" ? "horizontal" : "vertical"

  return (
    <div className="flex flex-col gap-4">
      <div className="text-xs text-muted-foreground">
        Image: {imageWidth} × {imageHeight} px — primary axis: {primaryLabel}
      </div>

      <FormField
        variant="numeric"
        numericMode="decimal"
        label="Supercell size (mm)"
        labelVisuallyHidden
        iconStart={ICON_SUPERCELL}
        unit="mm"
        id="supercell_mm"
        value={String(draft.supercell_mm)}
        onCommit={(raw) => {
          const n = Number(raw)
          if (Number.isFinite(n)) setField("supercell_mm", n)
        }}
        disabled={busy}
        inputProps={{ min: MIN_SUPERCELL_MM, step: 0.5 }}
      />

      <FormField
        variant="select"
        label="Cell shape"
        labelVisuallyHidden
        iconStart={ICON_SHAPE}
        value={draft.multiple_axis}
        options={SHAPE_OPTIONS}
        onCommit={(v) => setField("multiple_axis", v as MultipleAxis)}
        disabled={busy}
      />

      {draft.multiple_axis !== "none" ? (
        <FormField
          variant="numeric"
          numericMode="int"
          label="Stretch factor"
          labelVisuallyHidden
          iconStart={ICON_FACTOR}
          unit="×"
          id="multiple"
          value={String(draft.multiple)}
          onCommit={(raw) => {
            const n = Number(raw)
            if (Number.isFinite(n)) setField("multiple", Math.floor(n))
          }}
          disabled={busy}
          inputProps={{ min: 1 }}
        />
      ) : null}

      <FormField
        variant="numeric"
        numericMode="int"
        label={`Cells on the ${primaryLabel} axis`}
        labelVisuallyHidden
        iconStart={ICON_COUNT}
        unit="cells"
        id="primary_count"
        value={String(draft.primary_count)}
        onCommit={(raw) => {
          const n = Number(raw)
          if (Number.isFinite(n)) setField("primary_count", Math.floor(n))
        }}
        disabled={busy}
        inputProps={{ min: 1 }}
      />

      <GridSummary grid={grid} />
    </div>
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
          Border: {Math.round(grid.borderPx)} px on the{" "}
          {grid.primaryAxis === "horizontal" ? "vertical" : "horizontal"} axis
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
