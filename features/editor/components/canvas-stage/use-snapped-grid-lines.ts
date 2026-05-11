/**
 * Grid-line derivation for the canvas stage.
 *
 * Extracted from `project-canvas-stage.tsx` so the three-step
 * computation lives in one place:
 *
 *   1. `computeGridLines` from artboard + grid spacing
 *   2. `snapWorldToDeviceHalfPixel` against the current view
 *   3. `snapGridLinesToDevicePixels` for crisp 1px strokes
 *
 * The hook keeps the same call sites and dependency arrays the
 * inline code used. No behaviour change.
 */
import { useCallback, useMemo } from "react"

import { computeGridLines, snapGridLinesToDevicePixels } from "./grid-lines"
import { snapWorldToDeviceHalfPixel as snapHalfPixel } from "./pixel-snap"
import type { ViewState } from "./types"

export type GridSpec = {
  spacingXPx: number
  spacingYPx: number
  lineWidthPx: number
  color: string
}

export function useSnappedGridLines(input: {
  drawArtboard: boolean
  grid: GridSpec | null
  artW: number
  artH: number
  view: ViewState
}) {
  const { drawArtboard, grid, artW, artH, view } = input

  const gridLines = useMemo(() => {
    if (!drawArtboard) return null
    if (!grid) return null
    return computeGridLines({ artW, artH, grid, maxLines: 600 })
  }, [artH, artW, drawArtboard, grid])

  const snapWorldToDeviceHalfPixel = useCallback(
    (worldCoord: number, axis: "x" | "y") => {
      return snapHalfPixel({ worldCoord, axis, view: { scale: view.scale, x: view.x, y: view.y } })
    },
    [view.scale, view.x, view.y],
  )

  const snappedGridLines = useMemo(() => {
    return snapGridLinesToDevicePixels({ gridLines, snapWorldToDeviceHalfPixel })
  }, [gridLines, snapWorldToDeviceHalfPixel])

  return { gridLines, snappedGridLines, snapWorldToDeviceHalfPixel }
}
