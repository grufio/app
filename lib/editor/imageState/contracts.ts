/**
 * Image-state API contracts.
 *
 * Responsibilities:
 * - Define the minimal request/response shapes used by the image-state API routes.
 * - Keep transport types decoupled from in-memory BigInt types.
 */
export type ImageStateRow = {
  x_px_u?: string | null
  y_px_u?: string | null
  width_px_u: string
  height_px_u: string
  rotation_deg: number
}

export type GetImageStateResponse = { exists: false } | { exists: true; state: ImageStateRow }

export type SaveImageStateBody = {
  role: "master"
  x_px_u?: string
  y_px_u?: string
  width_px_u: string
  height_px_u: string
  rotation_deg: number
}

