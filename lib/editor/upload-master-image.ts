/**
 * Client upload use-case for master images.
 *
 * Responsibilities:
 * - Collect image metadata (dimensions, format, optional PPI).
 * - Build and submit upload form-data payload.
 * - Normalize API error responses for UI display.
 */
import { getImageDimensions } from "@/lib/images/dimensions"
import { guessImageFormat } from "@/lib/images/format-detection"

type UploadMasterImageOk = { ok: true }
type UploadMasterImageErr = { ok: false; error: string }

export type UploadMasterImageResult = UploadMasterImageOk | UploadMasterImageErr

function normalizePositiveInt(n: number): number | null {
  if (!Number.isFinite(n)) return null
  const v = Math.round(n)
  if (v <= 0) return null
  return v
}

function parsePpiFromPng(buffer: ArrayBuffer): number | null {
  const view = new DataView(buffer)
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (buffer.byteLength < sig.length) return null
  for (let i = 0; i < sig.length; i += 1) {
    if (view.getUint8(i) !== sig[i]) return null
  }

  let offset = 8
  while (offset + 8 <= buffer.byteLength) {
    const chunkLen = view.getUint32(offset)
    const typeOffset = offset + 4
    const dataOffset = offset + 8
    const endOffset = dataOffset + chunkLen + 4
    if (endOffset > buffer.byteLength) return null

    const type = String.fromCharCode(
      view.getUint8(typeOffset),
      view.getUint8(typeOffset + 1),
      view.getUint8(typeOffset + 2),
      view.getUint8(typeOffset + 3)
    )

    if (type === "pHYs" && chunkLen >= 9) {
      const xPpm = view.getUint32(dataOffset)
      const yPpm = view.getUint32(dataOffset + 4)
      const unit = view.getUint8(dataOffset + 8)
      if (unit !== 1 || xPpm <= 0 || yPpm <= 0) return null
      const xDpi = normalizePositiveInt(xPpm * 0.0254)
      const yDpi = normalizePositiveInt(yPpm * 0.0254)
      if (!xDpi || !yDpi) return null
      return normalizePositiveInt((xDpi + yDpi) / 2)
    }

    if (type === "IEND") return null
    offset = endOffset
  }

  return null
}

function parsePpiFromJpeg(buffer: ArrayBuffer): number | null {
  const bytes = new Uint8Array(buffer)
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null

  let i = 2
  while (i + 4 <= bytes.length) {
    while (i < bytes.length && bytes[i] === 0xff) i += 1
    if (i >= bytes.length) break
    const marker = bytes[i]
    i += 1

    if (marker === 0xd9 || marker === 0xda) break
    if (i + 2 > bytes.length) break
    const segLen = (bytes[i] << 8) | bytes[i + 1]
    i += 2
    if (segLen < 2 || i + segLen - 2 > bytes.length) break

    if (marker === 0xe0 && segLen >= 14) {
      const isJfif =
        bytes[i] === 0x4a && bytes[i + 1] === 0x46 && bytes[i + 2] === 0x49 && bytes[i + 3] === 0x46 && bytes[i + 4] === 0x00
      if (isJfif) {
        const units = bytes[i + 7]
        const xDensity = (bytes[i + 8] << 8) | bytes[i + 9]
        const yDensity = (bytes[i + 10] << 8) | bytes[i + 11]
        if (xDensity > 0 && yDensity > 0) {
          if (units === 1) return normalizePositiveInt((xDensity + yDensity) / 2)
          if (units === 2) return normalizePositiveInt(((xDensity + yDensity) / 2) * 2.54)
        }
      }
    }

    i += segLen - 2
  }

  return null
}

export function extractImagePpiFromBytes(buffer: ArrayBuffer, mimeType: string): number | null {
  const mime = mimeType.toLowerCase()
  if (mime === "image/png") return parsePpiFromPng(buffer)
  if (mime === "image/jpeg" || mime === "image/jpg") return parsePpiFromJpeg(buffer)
  return null
}

export async function extractImagePpi(file: File): Promise<number | null> {
  try {
    const buffer = await file.arrayBuffer()
    return extractImagePpiFromBytes(buffer, file.type || "")
  } catch {
    return null
  }
}

function formatUploadError(status: number, payload: Record<string, unknown> | null): string {
  const stage = typeof payload?.stage === "string" ? ` (${payload.stage})` : ""
  const msg =
    typeof payload?.error === "string" ? payload.error : payload ? JSON.stringify(payload) : "No JSON error body returned"
  return `Upload failed (HTTP ${status})${stage}: ${msg}`
}

export async function uploadMasterImage(args: {
  projectId: string
  file: File
  fetchImpl?: typeof fetch
}): Promise<UploadMasterImageResult> {
  const { projectId, file, fetchImpl = fetch } = args
  const { width, height } = await getImageDimensions(file)
  const format = guessImageFormat(file)
  const dpi = await extractImagePpi(file)

  const form = new FormData()
  form.set("file", file)
  form.set("width_px", String(width))
  form.set("height_px", String(height))
  form.set("format", format)
  if (dpi != null) form.set("dpi", String(dpi))

  const res = await fetchImpl(`/api/projects/${projectId}/images/master/upload`, {
    method: "POST",
    credentials: "same-origin",
    body: form,
  })

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null
    return { ok: false, error: formatUploadError(res.status, payload) }
  }

  return { ok: true }
}
