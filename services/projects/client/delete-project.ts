/**
 * Projects service (client): delete project.
 *
 * Responsibilities:
 * - Perform the delete-project HTTP request.
 * - Surface server-side error messages so the UI can show them instead
 *   of silently swallowing failures (the original silent-on-fail behavior
 *   hid a real bug — RESTRICT FKs blocking the cascade — for users).
 */
export type DeleteProjectResult =
  | { ok: true }
  | { ok: false; error: string; status: number }

export async function deleteProjectClient(projectId: string): Promise<DeleteProjectResult> {
  const res = await fetch(`/api/projects/${projectId}`, {
    method: "DELETE",
    credentials: "same-origin",
  })
  if (res.ok) return { ok: true }
  let serverMessage = ""
  try {
    const body = (await res.json()) as { error?: unknown; message?: unknown }
    if (typeof body?.error === "string") serverMessage = body.error
    else if (typeof body?.message === "string") serverMessage = body.message
  } catch {
    // non-JSON body; fall back to status text below
  }
  return {
    ok: false,
    error: serverMessage || res.statusText || `Request failed (${res.status})`,
    status: res.status,
  }
}
