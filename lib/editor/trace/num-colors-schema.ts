import { z } from "zod"

/**
 * Shared `num_colors` schema used by both pixelate + circulate
 * traces. Cap on distinct palette chips in the rendered output: the
 * filter-service applies a top-N reduction after the snap step, so a
 * value below the snap-winner count drops the least-used chips and
 * re-snaps the orphaned cells to the nearest kept chip. Default 16
 * matches typical paint-by-numbers tables; max 32 covers richer
 * print outputs without runaway noise.
 *
 * Single source of truth — drops the previous triple-declaration of
 * `min(2).max(32).default(16)` across `pixelate.ts` / `circulate.ts`
 * / `trace-colors-fields.tsx`.
 */
export const numColorsSchema = z.coerce.number().int().min(2).max(32).default(16)

export const NUM_COLORS_MIN = 2
export const NUM_COLORS_MAX = 32
export const NUM_COLORS_DEFAULT = 16
