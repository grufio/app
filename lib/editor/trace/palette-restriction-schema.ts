/**
 * Shared `palette_restriction` schema slice used by both pixelate +
 * circulate traces (PR-I). Picks how the active palette is capped to
 * `num_colors`:
 *
 *   - `"top_n"` → post-snap count-based reduction (pre-PR-I default).
 *                  Snap every cell against the full palette, histogram
 *                  the winners, keep the `num_colors` most-frequent
 *                  chips, re-snap the excluded cells to the nearest in
 *                  the kept set. Dominant-preserving but spread-unaware
 *                  — a small but distinct colour cluster whose chips
 *                  don't make the top-N gets re-snapped to whichever
 *                  popular chip is nearest, losing the cluster.
 *   - `"pam"`   → pre-snap k-medoid restriction (Kaufman & Rousseeuw
 *                  1987). Picks `num_colors` medoid chips from the full
 *                  palette by clustering the cell-mean histogram, then
 *                  snap (or dither) against the restricted palette of
 *                  `num_colors` chips. Skips the post-snap reduction.
 *                  Spread-optimal: minimises total snap distance over
 *                  the whole image, so rare-but-distinct clusters keep a
 *                  representative.
 *
 * Default `"top_n"` keeps persisted trace rows without this field
 * applying byte-identically to the pre-feature pipeline. Pydantic's
 * default-extra-ignore on `PixelateRequest` / `CirculateRequest` keeps
 * the rolling-deploy story safe in both directions.
 *
 * Interaction with `distance_metric` (PR-H): PAM builds its (N_unique ×
 * M) distance matrix in the active metric's space. CIEDE2000 + PAM is
 * a valid combination — the matrix is built with ΔE00 entries.
 *
 * Interaction with `dither_mode` (PR-F): orthogonal — the restricted
 * palette feeds whichever dither dispatch the user picked. KY + FS on a
 * PAM-restricted palette converge on N candidates whose running mean
 * tracks the target via the restricted set, which is the point of
 * combining the two switches.
 *
 * Math available via:
 *   - `lib/editor/trace/pam-palette.ts` — `pamSelectMedoids`,
 *     `distanceMatrixFromRows`
 *   - `filter-service/app/pam_palette.py` — sister module, same shape
 */
import { z } from "zod"

export const PALETTE_RESTRICTIONS = ["top_n", "pam"] as const
export type PaletteRestriction = (typeof PALETTE_RESTRICTIONS)[number]
export const paletteRestrictionSchema = z.enum(PALETTE_RESTRICTIONS).default("top_n")
