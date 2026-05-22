/**
 * Image-state serialization for API persistence.
 *
 * Responsibilities:
 * - Convert in-memory µpx/rotation values into API payload shapes.
 * - Avoid additional rounding; only clamp to safety bounds.
 *
 * Post PR #124 + working-copy-anchor client cleanup: no `image_id` /
 * `role` fields — the server resolves the persistence key from
 * `project_id` alone (working_copy.id anchor since PR #257).
 */
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

/**
 * Serialize an in-memory transform into the wire body of the
 * image-state route POST.
 *
 * Semantics:
 * - `width_px_u`, `height_px_u` are required and **clamped** to the
 *   editor bounds (`MIN_PX_U`..`MAX_PX_U`). Rounding happens **once**
 *   at user-input parse / bake-in, not here — see
 *   `docs/specs/sizing-invariants.mdx`.
 * - `x_px_u`, `y_px_u` are optional. **Omitting** an axis (returning
 *   `undefined`) tells the server route to **preserve** the existing
 *   axis value (per-axis preservation pattern). This is intentional
 *   for partial commits like setImagePosition({xPxU}).
 * - `rotation_deg` is always emitted.
 *
 * Implementation note: the falsy-truthy check on `t.xPxU` would drop
 * a literal `0n` value (BigInt zero is falsy). In practice, canvas
 * coordinates in µpx are never 0n for valid placements — the artboard
 * centre is hundreds of millions of µpx — so this edge is academic.
 */
export function toSaveImageStateBody(t: ImageStateSaveLike): SaveImageStateBody {
  return {
    x_px_u: t.xPxU ? t.xPxU.toString() : undefined,
    y_px_u: t.yPxU ? t.yPxU.toString() : undefined,
    width_px_u: clampMicroPx(t.widthPxU).toString(),
    height_px_u: clampMicroPx(t.heightPxU).toString(),
    rotation_deg: Number(t.rotationDeg),
  }
}

