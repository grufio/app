"use client"

/**
 * Client API wrapper for persisted image state.
 *
 * Responsibilities:
 * - Fetch and save the editor image transform state via `/api/projects/:id/image-state`.
 *
 * Post PR #257: state is anchored at the project's working_copy.id
 * server-side. The client only passes `projectId`; the server resolves
 * the persistence key (and the lock-guard target) internally. No
 * `?imageId=` query.
 */
import { fetchJson } from "@/lib/api/http"
import { ApiError } from "@/lib/api/api-error"
import type { GetImageStateResponse, SaveImageStateBody } from "@/lib/editor/imageState"

export type { GetImageStateResponse, ImageStateRow, SaveImageStateBody } from "@/lib/editor/imageState"

const IMAGE_STATE_URL = (projectId: string) => `/api/projects/${projectId}/image-state`

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

/** GET /api/projects/[projectId]/image-state — fetches the persisted image transform for the project. Throws `ApiError` on non-2xx. */
export async function getImageState(projectId: string): Promise<GetImageStateResponse> {
  const res = await fetchJson<GetImageStateResponse>(IMAGE_STATE_URL(projectId), {
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

/** POST /api/projects/[projectId]/image-state — persists the image transform (size + position + rotation). Throws `ApiError` on non-2xx.
 * Accepts an optional `AbortSignal` so callers can cancel in-flight requests (e.g. when the master changes mid-save). */
export async function saveImageState(
  projectId: string,
  body: SaveImageStateBody,
  options?: { signal?: AbortSignal },
): Promise<void> {
  const res = await fetchJson<unknown>(IMAGE_STATE_URL(projectId), {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: options?.signal,
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
