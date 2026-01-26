import { MAX_PX_U, MIN_PX_U, parseBigIntString } from "@/lib/editor/imageState"

export type IncomingImageStatePayload = {
  role?: "master" | "working"
  x_px_u?: unknown
  y_px_u?: unknown
  width_px_u?: unknown
  height_px_u?: unknown
  rotation_deg?: unknown
}

export type ValidatedImageStateUpsert = {
  role: "master" | "working"
  x_px_u: string | null
  y_px_u: string | null
  width_px_u: string
  height_px_u: string
  rotation_deg: number
}

export function validateIncomingImageStateUpsert(body: IncomingImageStatePayload): ValidatedImageStateUpsert | null {
  const role = body.role === "working" ? "working" : "master"
  const rotation_deg = Number(body.rotation_deg)

  const widthPxU = parseBigIntString(body.width_px_u)
  const heightPxU = parseBigIntString(body.height_px_u)
  const xPxU = body.x_px_u == null ? null : parseBigIntString(body.x_px_u)
  const yPxU = body.y_px_u == null ? null : parseBigIntString(body.y_px_u)

  if (
    !widthPxU ||
    !heightPxU ||
    widthPxU < MIN_PX_U ||
    heightPxU < MIN_PX_U ||
    widthPxU > MAX_PX_U ||
    heightPxU > MAX_PX_U ||
    (xPxU != null && (xPxU < -MAX_PX_U || xPxU > MAX_PX_U)) ||
    (yPxU != null && (yPxU < -MAX_PX_U || yPxU > MAX_PX_U)) ||
    !Number.isFinite(rotation_deg)
  ) {
    return null
  }

  return {
    role,
    x_px_u: xPxU == null ? null : xPxU.toString(),
    y_px_u: yPxU == null ? null : yPxU.toString(),
    width_px_u: widthPxU.toString(),
    height_px_u: heightPxU.toString(),
    rotation_deg,
  }
}

