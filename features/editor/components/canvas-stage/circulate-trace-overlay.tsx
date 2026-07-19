"use client"

/**
 * Circulate trace overlay (Konva) — renders the applied circulate trace's filled
 * CELLS (ellipses) + FRAMES (thin outlines) inside the stage layer, so the frame
 * outlines are crisp and zoom-stable instead of the soft, zoom-scaling strokes the
 * stretched DOM SVG produced. The paint-by-numbers labels stay in the DOM overlay
 * ON TOP (see TraceInlineSvg), preserving the cells < frames < numbers order.
 *
 * Sibling of `PixelateTraceOverlay`. Circulate is identified by `<g id="frames">`
 * (exclusive vs pixelate's `<g id="grid">`); `parseCirculateTraceSvg` returns null
 * otherwise, so this overlay never mounts for pixelate/linerate. Non-interactive
 * (circulate cells carry no `data-trace-region`).
 *
 * No pixel-snapping here (unlike the pixelate grid): ellipse curves cannot snap to
 * the device grid. Crispness comes from rendering at device resolution on the Konva
 * canvas + a constant-width frame stroke (`strokeScaleEnabled=false`), which also
 * keeps the stroke UNIFORM (the DOM SVG's `preserveAspectRatio="none"` distorted it).
 *
 * Geometry comes straight from the trace SVG (authoritative, drift-free). The Group's
 * `x/y/offset/rotation` place it at the frozen trace rect (centre + rotation); at
 * rotation 0 the transform is identity, so world coords render directly.
 */
import { useMemo } from "react"
import { Ellipse, Group } from "react-konva"

import type { ParsedCirculateTrace } from "@/lib/editor/trace/circulate-trace-parse"
import type { TraceWorldRect } from "@/lib/editor/trace/trace-overlay-rect"

import { useTraceContourStrokeCssPx } from "./device-pixel-ratio"

export function CirculateTraceOverlay({
  parsed,
  rect,
  rotation,
  cellsVisible,
}: {
  parsed: ParsedCirculateTrace
  /** Frozen trace world rect: `x/y` is the CENTRE, `width/height` the extent. */
  rect: TraceWorldRect
  rotation: number
  cellsVisible: boolean
}) {
  const { viewBoxW, viewBoxH, cells, frames } = parsed

  // ONE physical device pixel — the shared trace-contour hairline
  // (useTraceContourStrokeCssPx), same width as the pixelate grid and the
  // linerate outlines. strokeScaleEnabled:false keeps it constant at any zoom.
  const hairline = useTraceContourStrokeCssPx()

  const cornerX = rect.x - rect.width / 2
  const cornerY = rect.y - rect.height / 2
  const sx = rect.width / viewBoxW
  const sy = rect.height / viewBoxH

  // Map every ellipse from viewBox (crop-px) space into world coords over the rect
  // (non-uniform, mirroring the SVG stretch). Only recomputes when the rect changes.
  const cellShapes = useMemo(
    () =>
      cells.map((c, i) => ({
        key: `c${i}`,
        x: cornerX + c.cx * sx,
        y: cornerY + c.cy * sy,
        radiusX: c.rx * sx,
        radiusY: c.ry * sy,
        fill: c.fill,
        // Optional per-cell contour — rendered as the same 1-device-pixel hairline
        // as the frames/grid (constant on screen), not its crop-px width.
        hasContour: c.contour > 0,
      })),
    [cells, cornerX, cornerY, sx, sy],
  )

  const frameShapes = useMemo(
    () =>
      frames.map((f, i) => ({
        key: `f${i}`,
        x: cornerX + f.cx * sx,
        y: cornerY + f.cy * sy,
        radiusX: f.rx * sx,
        radiusY: f.ry * sy,
      })),
    [frames, cornerX, cornerY, sx, sy],
  )

  return (
    <Group x={rect.x} y={rect.y} offsetX={rect.x} offsetY={rect.y} rotation={rotation} listening={false}>
      {cellsVisible
        ? cellShapes.map((c) => (
            <Ellipse
              key={c.key}
              x={c.x}
              y={c.y}
              radiusX={c.radiusX}
              radiusY={c.radiusY}
              fill={c.fill}
              {...(c.hasContour ? { stroke: "black", strokeWidth: hairline, strokeScaleEnabled: false } : {})}
              listening={false}
              perfectDrawEnabled={false}
            />
          ))
        : null}
      {frameShapes.map((f) => (
        <Ellipse
          key={f.key}
          x={f.x}
          y={f.y}
          radiusX={f.radiusX}
          radiusY={f.radiusY}
          fill="transparent"
          stroke="black"
          strokeWidth={hairline}
          strokeScaleEnabled={false}
          listening={false}
          perfectDrawEnabled={false}
        />
      ))}
    </Group>
  )
}
