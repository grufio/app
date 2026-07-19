"use client"

/**
 * Pixelate trace overlay (Konva) — renders the applied pixelate trace's coloured
 * CELLS + GRID inside the stage layer, so the grid lines are device-pixel-snapped
 * and stay a crisp 1px hairline at any zoom (same mechanism as the artboard grid).
 * The paint-by-numbers labels stay in the DOM overlay ON TOP (see TraceInlineSvg),
 * preserving the cells < grid < numbers order.
 *
 * Non-interactive: pixelate cells carry no `data-trace-region` (that is a linerate
 * feature), so nothing here listens. Linerate/circulate have no `<g id="grid">`, so
 * `parsePixelateTraceSvg` returns null for them and this overlay never mounts.
 *
 * Geometry comes straight from the trace SVG (authoritative, drift-free). The
 * trace result is a CELL-BASED model — each cell is exactly ONE flat palette
 * colour — so cells render as one `Konva.Rect` per cell (a flat fill, mirroring
 * the saved SVG's `<rect>` per cell): resolution-independent, crisp flat blocks
 * at any zoom, NO interpolation between cell colours. (An earlier `Konva.Image`
 * bitmap upscaled a 1px-per-cell canvas and smoothed into continuous tones —
 * wrong for a cell model.) The grid is snapped `Konva.Line`s. The Group's
 * `x/y/offset/rotation` place it at the frozen trace rect (centre + rotation); at
 * rotation 0 the transform is identity, so snapped world coords land exactly on
 * the device grid. Any sub-pixel seam between adjacent cells sits on a boundary
 * and is covered by the always-drawn grid line.
 */
import { useMemo } from "react"
import { Group, Line, Rect } from "react-konva"

import type { ParsedPixelateTrace } from "@/lib/editor/trace/pixelate-trace-parse"
import type { TraceWorldRect } from "@/lib/editor/trace/trace-overlay-rect"

import { getStaticLineRenderProps, TRACE_CONTOUR_STROKE_CSS_PX } from "./line-rendering"

export function PixelateTraceOverlay({
  parsed,
  rect,
  rotation,
  cellsVisible,
  snapWorldToDeviceHalfPixel,
}: {
  parsed: ParsedPixelateTrace
  /** Frozen trace world rect: `x/y` is the CENTRE, `width/height` the extent. */
  rect: TraceWorldRect
  rotation: number
  cellsVisible: boolean
  snapWorldToDeviceHalfPixel: (worldCoord: number, axis: "x" | "y") => number
}) {
  const { viewBoxW, viewBoxH, cellsX, cellsY, cellRgb, gridXs, gridYs } = parsed

  const cornerX = rect.x - rect.width / 2
  const cornerY = rect.y - rect.height / 2
  const cellW = rect.width / cellsX
  const cellH = rect.height / cellsY

  // One Rect per cell — a flat fill, resolution-independent (the cell model).
  const cellRects = useMemo(() => {
    const out: Array<{ key: string; x: number; y: number; fill: string }> = []
    for (let cy = 0; cy < cellsY; cy += 1) {
      for (let cx = 0; cx < cellsX; cx += 1) {
        const rgb = cellRgb[cy * cellsX + cx]
        out.push({
          key: `${cx}-${cy}`,
          x: cornerX + cx * cellW,
          y: cornerY + cy * cellH,
          fill: `#${rgb.toString(16).padStart(6, "0")}`,
        })
      }
    }
    return out
  }, [cellRgb, cellsX, cellsY, cornerX, cornerY, cellW, cellH])

  // Map each viewBox grid coordinate into world space over the trace rect, then
  // snap it to the device grid (re-runs when `view` changes → stays crisp on zoom).
  const gridLines = useMemo(() => {
    const top = cornerY
    const bottom = cornerY + rect.height
    const left = cornerX
    const right = cornerX + rect.width
    const lines: Array<{ key: string; points: number[] }> = []
    for (const vx of gridXs) {
      const sx = snapWorldToDeviceHalfPixel(cornerX + (vx / viewBoxW) * rect.width, "x")
      lines.push({ key: `v${vx}`, points: [sx, top, sx, bottom] })
    }
    for (const hy of gridYs) {
      const sy = snapWorldToDeviceHalfPixel(cornerY + (hy / viewBoxH) * rect.height, "y")
      lines.push({ key: `h${hy}`, points: [left, sy, right, sy] })
    }
    return lines
  }, [gridXs, gridYs, cornerX, cornerY, rect.width, rect.height, viewBoxW, viewBoxH, snapWorldToDeviceHalfPixel])

  // Constant 1-CSS-pixel hairline, shared with the circulate frames and the
  // linerate outlines (TRACE_CONTOUR_STROKE_CSS_PX). strokeScaleEnabled:false
  // keeps it constant at any zoom; the grid is also device-snapped above, so it
  // renders crisp exactly like the artboard grid.
  const lineProps = getStaticLineRenderProps(TRACE_CONTOUR_STROKE_CSS_PX)

  return (
    <Group x={rect.x} y={rect.y} offsetX={rect.x} offsetY={rect.y} rotation={rotation} listening={false}>
      {cellsVisible
        ? cellRects.map((c) => (
            <Rect
              key={c.key}
              x={c.x}
              y={c.y}
              width={cellW}
              height={cellH}
              fill={c.fill}
              listening={false}
              perfectDrawEnabled={false}
              strokeEnabled={false}
            />
          ))
        : null}
      {gridLines.map((l) => (
        <Line key={l.key} points={l.points} stroke="black" {...lineProps} />
      ))}
    </Group>
  )
}
