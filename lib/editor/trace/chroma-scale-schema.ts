import { z } from "zod"

/**
 * Shared `pre_snap_chroma_scale` schema used by both pixelate +
 * circulate traces. Multiplies the chroma component of each cell's
 * OKLab mean **before** the nearest-palette-chip snap, pushing dull-
 * averaged cells toward more saturated chips so the picked chip-set
 * spans more of the palette instead of clustering in the low-chroma
 * (gray ramp) region.
 *
 * Range `[1.0, 1.5]`:
 *   - `1.0` = no boost = pre-feature behaviour (opt-out for users who
 *     want the unmodified snap).
 *   - `1.2` = default = visible saturation lift for existing users.
 *     Olive-mean (~chroma 0.085) becomes (~0.102) and snaps to the
 *     nearest saturated chip instead of a gray-ramp neighbour.
 *   - `1.5` = strong boost. May push toward out-of-gamut OKLab
 *     positions for already-vivid inputs, but the snap still lands
 *     on an in-gamut chip.
 *
 * Below `1.0` (desaturate) is out of scope — gegenteilig zur User-
 * Intention. Above `1.5` is unbounded out-of-gamut territory.
 *
 * Mechanism: `filter-service/app/oklab.py::adjust_oklab(chroma_scale=k)`
 * (Python) and `lib/color/oklab.ts::adjustOklab` (TS preview). Both
 * apply OKLCh chroma multiplication, keep L and hue untouched.
 *
 * Single source of truth — `min` / `max` / `default` flow to the
 * form via `extractNumberInputProps` + `parseFormNumber`.
 */
export const preSnapChromaScaleSchema = z.coerce.number().min(1.0).max(1.5).default(1.2)
