/**
 * Client upload use-case for master images.
 *
 * Responsibilities:
 * - Collect image metadata (dimensions, format).
 * - Build and submit upload form-data payload.
 * - Normalize API error responses for UI display.
 */
import { guessImageFormat } from "@/lib/images/format-detection"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { PROJECT_IMAGES_BUCKET } from "@/lib/storage/buckets"

export type UploadedMasterSnapshot = {
  id: string
  signedUrl: string
  /** Signed URL of the kind='master' row. At upload time the freshly
   * inserted master row IS the active row (no filter yet, working_copy
   * shares its storage_path), so `masterSignedUrl === signedUrl` from
   * the upload route. The field exists on the snapshot so the spread
   * into `seedMasterImage` at use-editor-workflow-adapter propagates
   * it without a separate fixup. */
  masterSignedUrl: string
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
    masterSignedUrl: typeof m.masterSignedUrl === "string" ? m.masterSignedUrl : m.signedUrl,
    storage_path: typeof m.storage_path === "string" ? m.storage_path : "",
    name: typeof m.name === "string" ? m.name : "master image",
    format: typeof m.format === "string" ? m.format : null,
    width_px: Number(m.width_px ?? 0),
    height_px: Number(m.height_px ?? 0),
    dpi: m.dpi == null ? null : Number(m.dpi),
    file_size_bytes: m.file_size_bytes == null ? null : Number(m.file_size_bytes),
  }
}

/**
 * Two-step upload that bypasses the serverless request-body limit:
 *   1. Upload the raw bytes DIRECTLY to Supabase Storage at
 *      `projects/{projectId}/images/{imageId}` (owner-only RLS authorizes it
 *      via the browser session — no file ever passes through the function).
 *   2. POST a tiny JSON `finalize` request; the server downloads that object,
 *      EXIF-normalises, validates, inserts the rows, and returns the snapshot.
 *
 * Pixel dimensions + DPI are still read server-side from the bytes (sharp);
 * the client only chooses the object id and sends a cheap format hint.
 */
export async function uploadMasterImageClient(args: {
  projectId: string
  file: File
  fetchImpl?: typeof fetch
  /** Browser Supabase client override (tests inject a stub). */
  supabaseClient?: ReturnType<typeof createSupabaseBrowserClient>
}): Promise<UploadMasterImageResult> {
  const { projectId, file, fetchImpl = fetch, supabaseClient } = args
  const format = guessImageFormat(file)
  const imageId = crypto.randomUUID()
  const objectPath = `projects/${projectId}/images/${imageId}`

  // Step 1 — direct-to-Storage upload (no Vercel 4.5MB body cap).
  const supabase = supabaseClient ?? createSupabaseBrowserClient()
  const { error: storageErr } = await supabase.storage
    .from(PROJECT_IMAGES_BUCKET)
    .upload(objectPath, file, { contentType: file.type || undefined, upsert: false })
  if (storageErr) {
    return { ok: false, error: `Upload failed (storage): ${storageErr.message}` }
  }

  // Step 2 — finalize (tiny JSON; server downloads + processes the object).
  const res = await fetchImpl(`/api/projects/${projectId}/images/master/finalize`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ imageId, fileName: file.name, format }),
  })

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null
    return { ok: false, error: formatUploadError(res.status, payload) }
  }

  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
  return { ok: true, master: parseMasterSnapshot(body?.master) }
}
