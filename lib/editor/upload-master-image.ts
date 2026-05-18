/**
 * Client upload use-case for master images.
 *
 * Responsibilities:
 * - Collect image metadata (dimensions, format).
 * - Build and submit upload form-data payload.
 * - Normalize API error responses for UI display.
 */
import { getImageDimensions } from "@/lib/images/dimensions"
import { guessImageFormat } from "@/lib/images/format-detection"
import { extractImageDPI } from "@/lib/images/dpi-extraction"

export type UploadedMasterSnapshot = {
  id: string
  signedUrl: string
  storage_path: string
  name: string
  format: string | null
  width_px: number
  height_px: number
  dpi: number | null
  file_size_bytes: number | null
}

type UploadMasterImageOk = { ok: true; master: UploadedMasterSnapshot | null }
type UploadMasterImageErr = { ok: false; error: string }

export type UploadMasterImageResult = UploadMasterImageOk | UploadMasterImageErr

function formatUploadError(status: number, payload: Record<string, unknown> | null): string {
  const stage = typeof payload?.stage === "string" ? ` (${payload.stage})` : ""
  const msg =
    typeof payload?.error === "string" ? payload.error : payload ? JSON.stringify(payload) : "No JSON error body returned"
  return `Upload failed (HTTP ${status})${stage}: ${msg}`
}

function parseMasterSnapshot(payload: unknown): UploadedMasterSnapshot | null {
  if (!payload || typeof payload !== "object") return null
  const m = payload as Record<string, unknown>
  if (typeof m.id !== "string" || typeof m.signedUrl !== "string") return null
  return {
    id: m.id,
    signedUrl: m.signedUrl,
    storage_path: typeof m.storage_path === "string" ? m.storage_path : "",
    name: typeof m.name === "string" ? m.name : "master image",
    format: typeof m.format === "string" ? m.format : null,
    width_px: Number(m.width_px ?? 0),
    height_px: Number(m.height_px ?? 0),
    dpi: m.dpi == null ? null : Number(m.dpi),
    file_size_bytes: m.file_size_bytes == null ? null : Number(m.file_size_bytes),
  }
}

export async function uploadMasterImageClient(args: {
  projectId: string
  file: File
  fetchImpl?: typeof fetch
}): Promise<UploadMasterImageResult> {
  const { projectId, file, fetchImpl = fetch } = args
  // Dimensions and DPI extraction are independent file-parsing tasks;
  // run them in parallel so the UI thread doesn't wait twice.
  const [{ width, height }, { dpiX, dpiY }] = await Promise.all([
    getImageDimensions(file),
    extractImageDPI(file),
  ])
  const dpi = Number.isFinite(dpiX) && dpiX > 0 ? Math.round(dpiX) : Number.isFinite(dpiY) && dpiY > 0 ? Math.round(dpiY) : null
  const format = guessImageFormat(file)

  const form = new FormData()
  form.set("file", file)
  form.set("width_px", String(width))
  form.set("height_px", String(height))
  if (dpi != null) form.set("dpi", String(dpi))
  form.set("format", format)

  const res = await fetchImpl(`/api/projects/${projectId}/images/master/upload`, {
    method: "POST",
    credentials: "same-origin",
    body: form,
  })

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null
    return { ok: false, error: formatUploadError(res.status, payload) }
  }

  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
  return { ok: true, master: parseMasterSnapshot(body?.master) }
}

// Backward-compatible alias during migration to explicit client/server naming.
export const uploadMasterImage = uploadMasterImageClient
