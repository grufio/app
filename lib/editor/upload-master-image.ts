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

type UploadMasterImageOk = { ok: true }
type UploadMasterImageErr = { ok: false; error: string }

export type UploadMasterImageResult = UploadMasterImageOk | UploadMasterImageErr

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

  const form = new FormData()
  form.set("file", file)
  form.set("width_px", String(width))
  form.set("height_px", String(height))
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

  return { ok: true }
}
