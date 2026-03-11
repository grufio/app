import type { MicroPx } from "@/lib/editor/imageState"

export type ImageTx = { xPxU: MicroPx; yPxU: MicroPx; widthPxU: MicroPx; heightPxU: MicroPx }

export type TransformCommit = { xPxU?: MicroPx; yPxU?: MicroPx; widthPxU: MicroPx; heightPxU: MicroPx; rotationDeg: number }

export type AlignImageOpts = {
  artW: number
  artH: number
  x?: "left" | "center" | "right"
  y?: "top" | "center" | "bottom"
}
