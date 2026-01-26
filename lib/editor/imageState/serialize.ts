import type { SaveImageStateBody } from "@/lib/editor/imageState/contracts"
import { clampMicroPx } from "@/lib/editor/imageState/micro-px"

export type ImageStateSaveLike = {
  xPxU?: bigint
  yPxU?: bigint
  widthPxU: bigint
  heightPxU: bigint
  rotationDeg: number
}

export function toSaveImageStateBody(t: ImageStateSaveLike): SaveImageStateBody {
  return {
    role: "master",
    x_px_u: t.xPxU ? t.xPxU.toString() : undefined,
    y_px_u: t.yPxU ? t.yPxU.toString() : undefined,
    width_px_u: clampMicroPx(t.widthPxU).toString(),
    height_px_u: clampMicroPx(t.heightPxU).toString(),
    rotation_deg: Number(t.rotationDeg),
  }
}

