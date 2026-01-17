"use client"

import { useCallback, useEffect, useState } from "react"

export type ImageState = {
  x: number
  y: number
  scaleX: number
  scaleY: number
  widthPx?: number
  heightPx?: number
  rotationDeg: number
}

export function useImageState(projectId: string, enabled: boolean) {
  const [initialImageTransform, setInitialImageTransform] = useState<ImageState | null>(null)
  const [imageStateError, setImageStateError] = useState("")
  const [imageStateLoading, setImageStateLoading] = useState(false)

  const loadImageState = useCallback(async () => {
    setImageStateError("")
    setImageStateLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/image-state`, {
        method: "GET",
        credentials: "same-origin",
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null
        const msg =
          typeof payload?.error === "string"
            ? payload.error
            : payload
              ? JSON.stringify(payload)
              : `HTTP ${res.status}`
        setImageStateError(msg)
        setInitialImageTransform(null)
        return
      }
      const payload = (await res.json().catch(() => null)) as
        | {
            exists?: boolean
            state?: {
              x: number
              y: number
              scale_x: number
              scale_y: number
              width_px?: number | null
              height_px?: number | null
              rotation_deg: number
            }
          }
        | null
      if (!payload?.exists || !payload.state) {
        setInitialImageTransform(null)
        return
      }
      setInitialImageTransform({
        x: Number(payload.state.x),
        y: Number(payload.state.y),
        scaleX: Number(payload.state.scale_x),
        scaleY: Number(payload.state.scale_y),
        widthPx: payload.state.width_px == null ? undefined : Number(payload.state.width_px),
        heightPx: payload.state.height_px == null ? undefined : Number(payload.state.height_px),
        rotationDeg: Number(payload.state.rotation_deg),
      })
    } catch (e) {
      console.error("Failed to load image state", e)
      setImageStateError("Failed to load image state.")
      setInitialImageTransform(null)
    } finally {
      setImageStateLoading(false)
    }
  }, [projectId])

  const saveImageState = useCallback(
    async (t: ImageState) => {
      try {
        const res = await fetch(`/api/projects/${projectId}/image-state`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: "master",
            x: t.x,
            y: t.y,
            scale_x: t.scaleX,
            scale_y: t.scaleY,
            width_px: t.widthPx,
            height_px: t.heightPx,
            rotation_deg: t.rotationDeg,
          }),
        })
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null
          const msg =
            typeof payload?.error === "string"
              ? payload.error
              : payload
                ? JSON.stringify(payload)
                : `HTTP ${res.status}`
          setImageStateError(msg)
        } else {
          setImageStateError("")
        }
      } catch (e) {
        console.error("Failed to save image state", e)
        setImageStateError("Failed to save image state.")
      }
    },
    [projectId]
  )

  useEffect(() => {
    if (!enabled) {
      setInitialImageTransform(null)
      setImageStateError("")
      setImageStateLoading(false)
      return
    }
    void loadImageState()
  }, [enabled, loadImageState])

  return { initialImageTransform, imageStateError, imageStateLoading, loadImageState, saveImageState }
}

