import { z } from "zod"

/**
 * Shared `num_colors` schema for the trace filters. `num_colors` is the
 * SELECTION BUDGET: the maximum number of distinct real paints the
 * filter-service's top-N / PAM reduction may pick from the fixed palette
 * after the snap step. It is an upper bound — the actual colour count in
 * the output emerges from the image (≤ budget), it is not forced.
 *
 * VALIDATION cap = the full colour palette (512 lab_munsell + 48 lab_grays
 * = 560). A larger budget lets the selection match the image more finely;
 * it never pushes more colours into the output than the image needs. The
 * memory of the snap is bounded independently of the budget (the chunked
 * `nearest_palette_indices`, #629), so the full palette is safe.
 *
 * The DIALOG offers a smaller, practical selection (`NUM_COLORS_DIALOG_MAX`)
 * — a paintable range for the user — while the validation schema still
 * accepts the full-palette budget for non-dialog paths (persisted rows,
 * presets). `numColorsDialogSchema` is what the shared control binds to, so
 * the dialog input hard-clamps to the dialog max; `numColorsSchema` is what
 * the trace request schemas validate against.
 *
 * Single source of truth — `min` / `max` / `default` flow to the form via
 * `extractNumberInputProps` + `parseFormNumber` (no mirror constants).
 */
export const NUM_COLORS_FULL_PALETTE = 560 // 512 lab_munsell + 48 lab_grays
export const NUM_COLORS_DIALOG_MAX = 64

export const numColorsSchema = z.coerce
  .number()
  .int()
  .min(2)
  .max(NUM_COLORS_FULL_PALETTE)
  .default(16)

/** The dialog's selectable range — decoupled from (and ≤) the validation cap. */
export const numColorsDialogSchema = z.coerce
  .number()
  .int()
  .min(2)
  .max(NUM_COLORS_DIALOG_MAX)
  .default(16)
