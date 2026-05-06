"use client"

/**
 * Grid overlay (Konva) for the artboard. Pure presentation: takes pre-snapped
 * grid line geometry and emits one `<Line>` per row/column. Lives co-located
 * with the canvas-stage so the host component can stay focused on lifecycle
 * and event wiring.
 */
import { Line } from "react-konva"

import { getStaticLineRenderProps } from "./line-rendering"

type SnappedGridLines = {
  stroke: string
  strokeWidth: number
  lines: Array<{ key: string; points: number[] }>
}

/** Renders the snapped grid lines under the selection frame, or null when empty/disabled. */
export function GridOverlay({ snappedGridLines }: { snappedGridLines: SnappedGridLines | null }) {
  if (!snappedGridLines || snappedGridLines.lines.length === 0) return null
  const lineProps = getStaticLineRenderProps(snappedGridLines.strokeWidth)
  return (
    <>
      {snappedGridLines.lines.map((l) => (
        <Line
          key={l.key}
          points={l.points}
          stroke={snappedGridLines.stroke}
          {...lineProps}
        />
      ))}
    </>
  )
}
