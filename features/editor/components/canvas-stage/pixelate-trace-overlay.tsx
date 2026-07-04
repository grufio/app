"use client"

/**
 * Pixelate trace overlay (Konva) — renders the applied pixelate trace's coloured
 * CELLS + GRID inside the stage layer, so the grid lines are device-pixel-snapped
 * and stay a crisp 1px hairline at any zoom (same mechanism as the artboard grid).
 * The paint-by-numbers labels stay in the DOM overlay ON TOP (see TraceInlineSvg),
 * preserving the cells < grid < numbers order.
 *
 * Non-interactive: pixelate cells carry no `data-trace-region` (that is a lineart
 * feature), so nothing here listens. Lineart/circulate have no `<g id="grid">`, so
 * `parsePixelateTraceSvg` returns null for them and this overlay never mounts.
 *
 * Geometry comes straight from the trace SVG (authoritative, drift-free): cells as
 * a tiny `cellsX×cellsY` offscreen canvas drawn as one `Konva.Image`
 * (`imageSmoothingEnabled=false` → crisp blocks), grid as snapped `Konva.Line`s.
 * The Group's `x/y/offset/rotation` place it at the frozen trace rect (centre +
 * rotation); at rotation 0 the transform is identity, so snapped world coords land
 * exactly on the device grid.
 */
import { useMemo } from "react"
import { Group, Image as KonvaImage, Line } from "react-konva"

import type { ParsedPixelateTrace } from "@/lib/editor/trace/pixelate-trace-parse"
import type { TraceWorldRect } from "@/lib/editor/trace/trace-overlay-rect"

import { getStaticLineRenderProps } from "./line-rendering"

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

  // One pixel per cell → Konva.Image stretches it to the trace rect with nearest-
  // neighbour (imageSmoothingEnabled=false). One cheap node regardless of zoom.
  const cellCanvas = useMemo(() => {
    if (typeof document === "undefined") return null
    const canvas = document.createElement("canvas")
    canvas.width = cellsX
    canvas.height = cellsY
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    const img = ctx.createImageData(cellsX, cellsY)
    for (let i = 0; i < cellRgb.length; i += 1) {
      const rgb = cellRgb[i]
      img.data[i * 4] = (rgb >> 16) & 0xff
      img.data[i * 4 + 1] = (rgb >> 8) & 0xff
      img.data[i * 4 + 2] = rgb & 0xff
      img.data[i * 4 + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
    return canvas
  }, [cellRgb, cellsX, cellsY])

  const cornerX = rect.x - rect.width / 2
  const cornerY = rect.y - rect.height / 2

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

  const lineProps = getStaticLineRenderProps(1)

  return (
    <Group x={rect.x} y={rect.y} offsetX={rect.x} offsetY={rect.y} rotation={rotation} listening={false}>
      {cellsVisible && cellCanvas ? (
        <KonvaImage
          image={cellCanvas}
          x={cornerX}
          y={cornerY}
          width={rect.width}
          height={rect.height}
          imageSmoothingEnabled={false}
          listening={false}
        />
      ) : null}
      {gridLines.map((l) => (
        <Line key={l.key} points={l.points} stroke="black" {...lineProps} />
      ))}
    </Group>
  )
}
