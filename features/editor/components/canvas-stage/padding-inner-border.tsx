"use client"

/**
 * Padding inner border (Konva) — a hairline rectangle stroked along the inner
 * edge of the padding veil (the printable content rect). Same crisp,
 * device-pixel-snapped 1px lines as `ArtboardBorder`; pure presentation.
 */
import { Line } from "react-konva"

import { getStaticLineRenderProps } from "./line-rendering"

export function PaddingInnerBorder({
  x,
  y,
  width,
  height,
  color,
  strokeWidth,
  snapWorldToDeviceHalfPixel,
}: {
  x: number
  y: number
  width: number
  height: number
  color: string
  strokeWidth: number
  snapWorldToDeviceHalfPixel: (worldCoord: number, axis: "x" | "y") => number
}) {
  const xL = snapWorldToDeviceHalfPixel(x, "x")
  const xR = snapWorldToDeviceHalfPixel(x + width, "x")
  const yT = snapWorldToDeviceHalfPixel(y, "y")
  const yB = snapWorldToDeviceHalfPixel(y + height, "y")
  const lineProps = getStaticLineRenderProps(strokeWidth)
  return (
    <>
      <Line points={[xL, yT, xL, yB]} stroke={color} {...lineProps} />
      <Line points={[xR, yT, xR, yB]} stroke={color} {...lineProps} />
      <Line points={[xL, yT, xR, yT]} stroke={color} {...lineProps} />
      <Line points={[xL, yB, xR, yB]} stroke={color} {...lineProps} />
    </>
  )
}
