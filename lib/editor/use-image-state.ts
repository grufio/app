"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

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

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}

function normalizeState(t: ImageState) {
  return {
    x: round4(t.x),
    y: round4(t.y),
    scaleX: round4(t.scaleX),
    scaleY: round4(t.scaleY),
    widthPx: t.widthPx == null ? undefined : round4(t.widthPx),
    heightPx: t.heightPx == null ? undefined : round4(t.heightPx),
    rotationDeg: round4(t.rotationDeg),
  }
}

export function useImageState(projectId: string, enabled: boolean) {
  const [initialImageTransform, setInitialImageTransform] = useState<ImageState | null>(null)
  const [imageStateError, setImageStateError] = useState("")
  const [imageStateLoading, setImageStateLoading] = useState(false)

  const logPrefix = useMemo(() => `[image-state:${projectId}]`, [projectId])

  const lastSavedSignatureRef = useRef<string | null>(null)
  const pendingRef = useRef<ImageState | null>(null)
  const timerRef = useRef<number | null>(null)

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
      console.error(`${logPrefix} load failed`, e)
      setImageStateError(e instanceof Error ? e.message : "Failed to load image state.")
      setInitialImageTransform(null)
    } finally {
      setImageStateLoading(false)
    }
  }, [logPrefix, projectId])

  const flush = useCallback(async () => {
    const t = pendingRef.current
    if (!t) return
    pendingRef.current = null

    const n = normalizeState(t)
    const signature = JSON.stringify(n)
    if (lastSavedSignatureRef.current === signature) return
    lastSavedSignatureRef.current = signature

    await saveImageStateApi(projectId, {
      role: "master",
      x: n.x,
      y: n.y,
      scale_x: n.scaleX,
      scale_y: n.scaleY,
      width_px: n.widthPx,
      height_px: n.heightPx,
      rotation_deg: n.rotationDeg,
    })
  }, [projectId])

  const saveImageState = useCallback(
    async (t: ImageState) => {
      try {
        // Throttle + skip no-op saves (MVP-friendly: less network spam, same UX).
        pendingRef.current = t
        if (timerRef.current != null) return
        timerRef.current = window.setTimeout(async () => {
          timerRef.current = null
          try {
            await flush()
            setImageStateError("")
          } catch (e) {
            console.error(`${logPrefix} save failed`, e)
            setImageStateError(e instanceof Error ? e.message : "Failed to save image state.")
          }
        }, 250)
        setImageStateError("")
      } catch (e) {
        console.error(`${logPrefix} save failed`, e)
        setImageStateError(e instanceof Error ? e.message : "Failed to save image state.")
      }
    },
    [flush, logPrefix]
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

  useEffect(() => {
    return () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      pendingRef.current = null
    }
  }, [])

  return { initialImageTransform, imageStateError, imageStateLoading, loadImageState, saveImageState }
}

