"use client"

/**
 * Client API wrapper for persisted image state.
 *
 * Responsibilities:
 * - Fetch and save the editor image transform state via `/api/projects/:id/image-state`.
 */
import { fetchJson } from "@/lib/api/http"
import { ApiError } from "@/lib/api/api-error"

export type { GetImageStateResponse, ImageStateRow, SaveImageStateBody } from "@/lib/editor/imageState"

function buildImageStateUrl(projectId: string, imageId?: string): string {
  const base = `/api/projects/${projectId}/image-state`
  if (!imageId) return base
  const q = new URLSearchParams({ imageId })
  return `${base}?${q.toString()}`
}

export async function getImageState(projectId: string, imageId?: string): Promise<GetImageStateResponse> {
  const res = await fetchJson<GetImageStateResponse>(buildImageStateUrl(projectId, imageId), {
    method: "GET",
    credentials: "same-origin",
  })
  if (!res.ok) {
    throw new ApiError({ prefix: "image_state", action: "load", status: res.status, payload: res.error })
  }
  return res.data
}

export async function saveImageState(projectId: string, body: SaveImageStateBody, imageId?: string): Promise<void> {
  const res = await fetchJson<unknown>(buildImageStateUrl(projectId, imageId), {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new ApiError({ prefix: "image_state", action: "save", status: res.status, payload: res.error })
  }
}

