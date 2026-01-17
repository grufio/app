"use client"

import { fetchJson } from "@/lib/api/http"

export type ImageStateRow = {
  x: number
  y: number
  scale_x: number
  scale_y: number
  width_px?: number | null
  height_px?: number | null
  rotation_deg: number
}

export type GetImageStateResponse = { exists: false } | { exists: true; state: ImageStateRow }

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

export type SaveImageStateBody = {
  role: "master"
  x: number
  y: number
  scale_x: number
  scale_y: number
  width_px?: number
  height_px?: number
  rotation_deg: number
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

