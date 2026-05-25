/**
 * Client upload use-case for master images.
 *
 * Responsibilities:
 * - Collect image metadata (dimensions, format).
 * - Build and submit upload form-data payload.
 * - Normalize API error responses for UI display.
 */
import { guessImageFormat } from "@/lib/images/format-detection"

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
  // Pixel dimensions + DPI are read server-side from the file bytes (sharp)
  // in the upload route — authoritative and not trusted from the client. The
  // client only sends the file + a cheap format hint.
  const format = guessImageFormat(file)

  const form = new FormData()
  form.set("file", file)
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
