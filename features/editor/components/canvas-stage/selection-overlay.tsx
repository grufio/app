"use client"

import { memo } from "react"
import { Line, Rect } from "react-konva"

import { computeSelectionHandleRects } from "@/services/editor"
import type { BoundsRect, ViewState } from "./types"
import { getStaticLineRenderProps } from "./line-rendering"

export const SelectionOverlay = memo(function SelectionOverlay({
  imageBounds,
  view,
  selectionHandlePx,
  selectionColor,
  selectionDash,
  snapWorldToDeviceHalfPixel,
}: {
  imageBounds: BoundsRect | null
  view: ViewState
  selectionHandlePx: number
  selectionColor: string
  selectionDash: number[] | undefined
  snapWorldToDeviceHalfPixel: (worldCoord: number, axis: "x" | "y") => number
}) {
  if (!imageBounds) return null
  const rects = computeSelectionHandleRects({
    bounds: { x: imageBounds.x, y: imageBounds.y, w: imageBounds.w, h: imageBounds.h },
    view: { x: view.x, y: view.y, scale: view.scale },
    handlePx: selectionHandlePx,
    snapWorldToDeviceHalfPixel,
  })
  const { x1, y1, x2, y2 } = rects.outline
  const { tl, tm, tr, rm, br, bm, bl, lm } = rects.handles
  const handleW = rects.handleSize.w
  const handleH = rects.handleSize.h
  const handleRects = [tl, tm, tr, rm, br, bm, bl, lm]
  const lineProps = getStaticLineRenderProps(1)

  return (
    <>
      <Line points={[x1, y1, x2, y1]} stroke={selectionColor} dash={selectionDash} {...lineProps} />
      <Line points={[x2, y1, x2, y2]} stroke={selectionColor} dash={selectionDash} {...lineProps} />
      <Line points={[x2, y2, x1, y2]} stroke={selectionColor} dash={selectionDash} {...lineProps} />
      <Line points={[x1, y2, x1, y1]} stroke={selectionColor} dash={selectionDash} {...lineProps} />

      {handleRects.map((h, idx) => (
        <Rect
          key={`selection-handle-${idx}`}
          x={h.x}
          y={h.y}
          width={handleW}
          height={handleH}
          fill="#ffffff"
          stroke={selectionColor}
          strokeWidth={1}
          strokeScaleEnabled={false}
          listening={false}
        />
      ))}
    </>
  )
})
