import type { UploadMasterImageFailure } from "./types"
import { parseAllowedMimeList, parseOptionalPositiveInt } from "./validation"

export function validateUploadInputs(args: {
  widthPx: number | null
  heightPx: number | null
  dpi: number | null
  bitDepth: number | null
}): UploadMasterImageFailure | null {
  const { widthPx, heightPx, dpi, bitDepth } = args
  if (!widthPx || !heightPx) {
    return {
      ok: false,
      status: 400,
      stage: "validation",
      reason: "Missing/invalid width_px/height_px",
    }
  }

  if (!dpi || !bitDepth) {
    return {
      ok: false,
      status: 400,
      stage: "validation",
      reason: "Missing/invalid dpi/bit_depth",
    }
  }

  return null
}

export function validateUploadLimits(args: {
  file: File
  widthPx: number
  heightPx: number
}): UploadMasterImageFailure | null {
  const { file, widthPx, heightPx } = args

  const maxUploadBytes = parseOptionalPositiveInt(process.env.USER_MAX_UPLOAD_BYTES)
  if (maxUploadBytes != null && file.size > maxUploadBytes) {
    return {
      ok: false,
      status: 413,
      stage: "upload_limits",
      reason: "Upload too large",
      details: {
        max_bytes: maxUploadBytes,
        got_bytes: file.size,
      },
    }
  }

  const allowedMime = parseAllowedMimeList(process.env.USER_ALLOWED_UPLOAD_MIME)
  if (allowedMime != null) {
    const mime = (file.type || "").trim()
    if (!mime || !allowedMime.has(mime)) {
      return {
        ok: false,
        status: 415,
        stage: "upload_limits",
        reason: "Unsupported file type",
        details: {
          mime: mime || null,
          allowed_mime: Array.from(allowedMime),
        },
      }
    }
  }

  const maxPixels = parseOptionalPositiveInt(process.env.USER_UPLOAD_MAX_PIXELS)
  if (maxPixels != null) {
    const pixels = BigInt(widthPx) * BigInt(heightPx)
    if (pixels > BigInt(maxPixels)) {
      return {
        ok: false,
        status: 413,
        stage: "upload_limits",
        reason: "Image dimensions too large",
        details: {
          max_pixels: maxPixels,
          width_px: widthPx,
          height_px: heightPx,
        },
      }
    }
  }

  return null
}
