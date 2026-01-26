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

