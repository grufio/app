/**
 * Canonical image-state types.
 *
 * Responsibilities:
 * - Define the µpx fixed-point scalar type used throughout the editor model.
 */
// µpx fixed-point integer (BigInt).
// Canonical truth in the sizing model. See docs/specs/sizing-invariants.mdx
export type MicroPx = bigint

/**
 * In-memory image transform (canvas display geometry) in µpx + degrees.
 *
 * Server-neutral home: both the client display-size hook
 * (`lib/editor/hooks/use-display-size.ts`) and the server fetch helper
 * (`services/editor/server/image-state.ts`) import this. Position fields
 * are optional because legacy SSR rows may omit x/y; width/height are the
 * meaningful display dimensions and are present whenever a row exists.
 */
export type ImageState = {
  xPxU?: bigint
  yPxU?: bigint
  widthPxU?: bigint
  heightPxU?: bigint
  rotationDeg: number
}

