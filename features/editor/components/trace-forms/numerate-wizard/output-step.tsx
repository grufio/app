import type { NumerateGrid } from "@/lib/editor/trace/numerate-grid-math"

export function OutputStep(props: {
  grid: NumerateGrid
  workspaceWidthPx: number | null
  workspaceHeightPx: number | null
}) {
  const { grid, workspaceWidthPx, workspaceHeightPx } = props
  if (workspaceWidthPx == null || workspaceHeightPx == null) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
        Artboard size is not set yet. Open the Artboard panel and configure
        width × height before applying the trace.
      </div>
    )
  }
  // Physical template size = cell count × physical cell size per axis.
  const templateW = grid.cellsX * grid.cellMmW
  const templateH = grid.cellsY * grid.cellMmH
  return (
    <div className="space-y-2">
      <div className="rounded-md border bg-muted/40 px-3 py-3 text-xs">
        <div>
          Grid: <span className="font-medium text-foreground">{grid.cellsX} × {grid.cellsY} cells</span>
        </div>
        <div className="mt-1">
          Template size:{" "}
          <span className="font-medium text-foreground">
            {templateW.toFixed(1)} × {templateH.toFixed(1)} mm
          </span>{" "}
          ({grid.cellMmW} × {grid.cellMmH} mm per cell)
        </div>
        {grid.borderPx > 0 ? (
          <div className="mt-1 text-muted-foreground">
            The image format does not divide evenly — a centred border is left on the
            {grid.primaryAxis === "horizontal" ? " top and bottom" : " left and right"}.
          </div>
        ) : null}
        <div className="mt-2 text-muted-foreground">
          The trace is placed onto the artboard at the current image position.
          Change the artboard dimensions in the right-panel “Artboard” section.
        </div>
      </div>
    </div>
  )
}
