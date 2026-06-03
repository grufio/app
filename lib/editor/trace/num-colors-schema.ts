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
 * Single source of truth — `min` / `max` / `default` flow to the
 * form via `extractNumberInputProps` + `parseFormNumber` (no
 * `NUM_COLORS_MIN/MAX/DEFAULT` mirror constants).
 */
export const numColorsSchema = z.coerce.number().int().min(2).max(32).default(16)
