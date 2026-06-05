import { z } from "zod"

/**
 * Shared `pre_snap_chroma_scale` schema used by both pixelate +
 * circulate traces. Multiplies the chroma component of each cell's
 * OKLab mean **before** the nearest-palette-chip snap.
 *
 * Range `[1.0, 1.5]`, default `1.0` (no-op = byte-identical to
 * pre-feature pipeline). Form-UI exposes no selector anymore; the
 * field stays on the schema for backward compatibility with
 * persisted trace rows that carry an explicit value (`1.2` from
 * #400's misguided default), so re-applying them still parses.
 *
 * Background: #400 shipped this as a `1.2` default with a
 * three-stop "Color saturation" selector. Investigation against
 * the user's actual source data showed the boost was suboptimal
 * for typical warm-beige photo content (it pushed already-warm
 * cell-means further away from the gray ramp). Rather than tune
 * the threshold, the trace pipeline is being reworked end-to-end
 * with established quantization + dithering techniques (see
 * planning doc — PAM palette restriction, Knoll-Yliluoma dithering,
 * Floyd-Steinberg as alternative, CIEDE2000 distance metric). This
 * boost-knob is part of the cleanup that lands ahead of those.
 *
 * Mechanism still wired: `filter-service/app/oklab.py::adjust_oklab`
 * + TS mirror `lib/color/oklab.ts::adjustOklab` apply the OKLCh
 * chroma multiplication when the field is non-1.0.
 */
export const preSnapChromaScaleSchema = z.coerce.number().min(1.0).max(1.5).default(1.0)
