"use client"

/**
 * Padding inner border (Konva) — a hairline dotted rectangle stroked along the
 * inner edge of the padding veil (the printable content rect). Same crisp,
 * device-pixel-snapped 1px lines as `ArtboardBorder`; pure presentation.
 */
import { Line } from "react-konva"

import { getStaticLineRenderProps } from "./line-rendering"

// Fine dotted pattern (device px — strokeScaleEnabled is off, so it stays
// constant at any zoom): 1px dot, 2px gap.
const DOTTED_DASH = [1, 2] as const

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
  const dash = [...DOTTED_DASH]
  return (
    <>
      <Line points={[xL, yT, xL, yB]} stroke={color} dash={dash} {...lineProps} />
      <Line points={[xR, yT, xR, yB]} stroke={color} dash={dash} {...lineProps} />
      <Line points={[xL, yT, xR, yT]} stroke={color} dash={dash} {...lineProps} />
      <Line points={[xL, yB, xR, yB]} stroke={color} dash={dash} {...lineProps} />
    </>
  )
}
