"use client"

/**
 * Client API wrapper for persisted image state.
 *
 * Responsibilities:
 * - Fetch and save the editor image transform state via `/api/projects/:id/image-state`.
 */
import { fetchJson } from "@/lib/api/http"

export type { GetImageStateResponse, ImageStateRow, SaveImageStateBody } from "@/lib/editor/imageState"

export async function getImageState(projectId: string): Promise<GetImageStateResponse> {
  const res = await fetchJson<GetImageStateResponse>(`/api/projects/${projectId}/image-state`, {
    method: "GET",
    credentials: "same-origin",
  })
  if (!res.ok) {
    const msg = `Failed to load image state (HTTP ${res.status})` + (res.error ? ` ${JSON.stringify(res.error)}` : "")
    throw new Error(msg)
  }
  return res.data
}

export async function saveImageState(projectId: string, body: SaveImageStateBody): Promise<void> {
  const res = await fetchJson<unknown>(`/api/projects/${projectId}/image-state`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const msg = `Failed to save image state (HTTP ${res.status})` + (res.error ? ` ${JSON.stringify(res.error)}` : "")
    throw new Error(msg)
  }
}

