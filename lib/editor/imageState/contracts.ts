/**
 * Image-state API contracts.
 *
 * Responsibilities:
 * - Define the minimal request/response shapes used by the image-state API routes.
 * - Keep transport types decoupled from in-memory BigInt types.
 *
 * Post PR #124: state is anchored at the project's master.id server-side.
 * The save body carries only transform fields; the server resolves the
 * persistence key (master.id) and the lock-guard target internally.
 * `ImageStateRow` keeps `image_id` because the server still emits it in
 * the GET response for debug visibility (it's always master.id post-#124).
 */
export type ImageStateRow = {
  image_id?: string | null
  x_px_u?: string | null
  y_px_u?: string | null
  width_px_u: string
  height_px_u: string
  rotation_deg: number
}

export type GetImageStateResponse = { exists: false } | { exists: true; state: ImageStateRow }

export type SaveImageStateBody = {
  x_px_u?: string
  y_px_u?: string
  width_px_u: string
  height_px_u: string
  rotation_deg: number
}

