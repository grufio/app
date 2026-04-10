"use client"

/**
 * Client API wrapper for persisted image state.
 *
 * Responsibilities:
 * - Fetch and save the editor image transform state via `/api/projects/:id/image-state`.
 */
import { fetchJson } from "@/lib/api/http"
import { ApiError } from "@/lib/api/api-error"
import type { GetImageStateResponse, SaveImageStateBody } from "@/lib/editor/imageState"

export type { GetImageStateResponse, ImageStateRow, SaveImageStateBody } from "@/lib/editor/imageState"

function buildImageStateUrl(projectId: string, imageId?: string): string {
  const base = `/api/projects/${projectId}/image-state`
  if (!imageId) return base
  const q = new URLSearchParams({ imageId })
  return `${base}?${q.toString()}`
}

function normalizeApiErrorPayload(payload: unknown, status: number) {
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>
    const hasStage = typeof obj.stage === "string" && obj.stage.trim().length > 0
    const hasError = typeof obj.error === "string" && obj.error.trim().length > 0
    if (hasStage || hasError) {
      return obj
    }
  }
  return {
    stage: `http_${status}`,
    error: "image-state request failed",
    status,
  }
}

export async function getImageState(projectId: string, imageId?: string): Promise<GetImageStateResponse> {
  const res = await fetchJson<GetImageStateResponse>(buildImageStateUrl(projectId, imageId), {
    method: "GET",
    credentials: "same-origin",
  })
  if (!res.ok) {
    throw new ApiError({
      prefix: "image_state",
      action: "load",
      status: res.status,
      payload: normalizeApiErrorPayload(res.error, res.status),
    })
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
    throw new ApiError({
      prefix: "image_state",
      action: "save",
      status: res.status,
      payload: normalizeApiErrorPayload(res.error, res.status),
    })
  }
}

