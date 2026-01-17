"use client"

import { useCallback, useEffect, useState } from "react"

import { getImageState, saveImageState as saveImageStateApi } from "@/lib/api/image-state"

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
      const payload = await getImageState(projectId)
      if (!payload?.exists) {
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
      setImageStateError(e instanceof Error ? e.message : "Failed to load image state.")
      setInitialImageTransform(null)
    } finally {
      setImageStateLoading(false)
    }
  }, [projectId])

  const saveImageState = useCallback(
    async (t: ImageState) => {
      try {
        await saveImageStateApi(projectId, {
          role: "master",
          x: t.x,
          y: t.y,
          scale_x: t.scaleX,
          scale_y: t.scaleY,
          width_px: t.widthPx,
          height_px: t.heightPx,
          rotation_deg: t.rotationDeg,
        })
        setImageStateError("")
      } catch (e) {
        console.error("Failed to save image state", e)
        setImageStateError(e instanceof Error ? e.message : "Failed to save image state.")
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

