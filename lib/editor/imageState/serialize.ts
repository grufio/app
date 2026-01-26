import type { SaveImageStateBody } from "@/lib/editor/imageState/contracts"
import type { MicroPx } from "@/lib/editor/imageState/types"
import { clampMicroPx } from "@/lib/editor/imageState/micro-px"

export type ImageStateSaveLike = {
  xPxU?: MicroPx
  yPxU?: MicroPx
  widthPxU: MicroPx
  heightPxU: MicroPx
  rotationDeg: number
}

export function toSaveImageStateBody(t: ImageStateSaveLike): SaveImageStateBody {
  // Save/persist must never apply another rounding pass.
  // Only clamp defensively; rounding is done at bake-in / unit input conversion.
  // See docs/specs/sizing-invariants.mdx
  return {
    role: "master",
    x_px_u: t.xPxU ? t.xPxU.toString() : undefined,
    y_px_u: t.yPxU ? t.yPxU.toString() : undefined,
    width_px_u: clampMicroPx(t.widthPxU).toString(),
    height_px_u: clampMicroPx(t.heightPxU).toString(),
    rotation_deg: Number(t.rotationDeg),
  }
}

