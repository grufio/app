"use client"

/**
 * Artboard border (Konva) — 4 device-pixel-snapped 1px lines drawn on top of
 * everything else inside the stage layer. Pure presentation: receives only
 * geometry and the snap helper. Lives co-located with the canvas-stage so the
 * host component stays focused on lifecycle and event wiring.
 */
import { Line } from "react-konva"

import { getStaticLineRenderProps } from "./line-rendering"

/**
 * Renders the 4-line artboard border. The lines are 1 device pixel each
 * (no scaling) so they stay crisp at any zoom level.
 */
export function ArtboardBorder({
  artW,
  artH,
  borderColor,
  borderWidth,
  snapWorldToDeviceHalfPixel,
}: {
  artW: number
  artH: number
  borderColor: string
  borderWidth: number
  snapWorldToDeviceHalfPixel: (worldCoord: number, axis: "x" | "y") => number
}) {
  const xL = snapWorldToDeviceHalfPixel(0, "x")
  const xR = snapWorldToDeviceHalfPixel(artW, "x")
  const yT = snapWorldToDeviceHalfPixel(0, "y")
  const yB = snapWorldToDeviceHalfPixel(artH, "y")
  const lineProps = getStaticLineRenderProps(borderWidth)
  return (
    <>
      <Line points={[xL, 0, xL, artH]} stroke={borderColor} {...lineProps} />
      <Line points={[xR, 0, xR, artH]} stroke={borderColor} {...lineProps} />
      <Line points={[0, yT, artW, yT]} stroke={borderColor} {...lineProps} />
      <Line points={[0, yB, artW, yB]} stroke={borderColor} {...lineProps} />
    </>
  )
}
