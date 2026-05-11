/**
 * Image-state input validation.
 *
 * Responsibilities:
 * - Validate incoming JSON payloads for image-state upserts.
 * - Enforce bounds/invariants before persisting to the database.
 */
import { MAX_PX_U, MIN_PX_U, parseBigIntString } from "@/lib/editor/imageState"

export type IncomingImageStatePayload = {
  image_id?: unknown
  x_px_u?: unknown
  y_px_u?: unknown
  width_px_u?: unknown
  height_px_u?: unknown
  rotation_deg?: unknown
}

export type ValidatedImageStateUpsert = {
  image_id: string
  /**
   * `string` — explicit value; persist as-is.
   * `undefined` — axis omitted from payload; route preserves the existing
   *   row's value (read-merge before upsert).
   *
   * `null` is intentionally rejected as a payload value: callers must omit
   * the key to mean "preserve". This avoids ambiguity between "clear axis"
   * and "preserve axis".
   */
  x_px_u: string | undefined
  y_px_u: string | undefined
  width_px_u: string
  height_px_u: string
  rotation_deg: number
}

export function validateIncomingImageStateUpsert(body: IncomingImageStatePayload): ValidatedImageStateUpsert | null {
  const imageId = typeof body.image_id === "string" ? body.image_id.trim() : ""
  const rotation_deg = Number(body.rotation_deg)

  const widthPxU = parseBigIntString(body.width_px_u)
  const heightPxU = parseBigIntString(body.height_px_u)
  // Partial-update contract: a missing key (or undefined) means "preserve the
  // existing axis value in the database". This lets per-axis edits in the
  // editor commit only the changed axis without nulling the other one.
  const xPxU = body.x_px_u === undefined ? undefined : parseBigIntString(body.x_px_u)
  const yPxU = body.y_px_u === undefined ? undefined : parseBigIntString(body.y_px_u)

  if (
    !imageId ||
    !widthPxU ||
    !heightPxU ||
    widthPxU < MIN_PX_U ||
    heightPxU < MIN_PX_U ||
    widthPxU > MAX_PX_U ||
    heightPxU > MAX_PX_U ||
    // Reject null axes outright — callers must omit the key to mean "preserve".
    body.x_px_u === null ||
    body.y_px_u === null ||
    // A provided axis must parse to a valid bigint within bounds.
    (body.x_px_u !== undefined && (xPxU == null || xPxU < -MAX_PX_U || xPxU > MAX_PX_U)) ||
    (body.y_px_u !== undefined && (yPxU == null || yPxU < -MAX_PX_U || yPxU > MAX_PX_U)) ||
    !Number.isFinite(rotation_deg)
  ) {
    return null
  }

  return {
    image_id: imageId,
    x_px_u: xPxU?.toString(),
    y_px_u: yPxU?.toString(),
    width_px_u: widthPxU.toString(),
    height_px_u: heightPxU.toString(),
    rotation_deg,
  }
}

