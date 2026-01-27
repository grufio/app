"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { getImageState, saveImageState as saveImageStateApi } from "@/lib/api/image-state"
import { parseBigIntString, toSaveImageStateBody } from "@/lib/editor/imageState"

export type ImageState = {
  xPxU?: bigint
  yPxU?: bigint
  widthPxU?: bigint
  heightPxU?: bigint
  rotationDeg: number
}

export function useImageState(projectId: string, enabled: boolean) {
  const [initialImageTransform, setInitialImageTransform] = useState<ImageState | null>(null)
  const [imageStateError, setImageStateError] = useState("")
  const [imageStateLoading, setImageStateLoading] = useState(false)

  const logPrefix = useMemo(() => `[image-state:${projectId}]`, [projectId])

  const lastSavedSignatureRef = useRef<string | null>(null)
  const pendingRef = useRef<ImageState | null>(null)
  const timerRef = useRef<number | null>(null)
  const requestSeqRef = useRef(0)

  const loadImageState = useCallback(async () => {
    const seq = ++requestSeqRef.current
    setImageStateError("")
    setImageStateLoading(true)
    try {
      const payload = await getImageState(projectId)
      if (seq !== requestSeqRef.current) return
      if (!payload?.exists) {
        setInitialImageTransform(null)
        return
      }
      const widthPxU = parseBigIntString(payload.state.width_px_u)
      const heightPxU = parseBigIntString(payload.state.height_px_u)
      if (!widthPxU || !heightPxU) {
        throw new Error("Unsupported image state: missing width_px_u/height_px_u")
      }
      const xPxU = parseBigIntString(payload.state.x_px_u)
      const yPxU = parseBigIntString(payload.state.y_px_u)
      setInitialImageTransform({
        xPxU: xPxU ?? undefined,
        yPxU: yPxU ?? undefined,
        widthPxU,
        heightPxU,
        rotationDeg: Number(payload.state.rotation_deg),
      })
    } catch (e) {
      if (seq !== requestSeqRef.current) return
      console.error(`${logPrefix} load failed`, e)
      setImageStateError(e instanceof Error ? e.message : "Failed to load image state.")
      setInitialImageTransform(null)
    } finally {
      if (seq !== requestSeqRef.current) return
      setImageStateLoading(false)
    }
  }, [logPrefix, projectId])

  const flush = useCallback(async () => {
    const t = pendingRef.current
    if (!t) return
    pendingRef.current = null

    if (!t.widthPxU || !t.heightPxU) return

    const payload = toSaveImageStateBody({
      xPxU: t.xPxU,
      yPxU: t.yPxU,
      widthPxU: t.widthPxU,
      heightPxU: t.heightPxU,
      rotationDeg: t.rotationDeg,
    })

    // Avoid JSON.stringify GC churn; we only need a stable equality key.
    const signature = `${payload.x_px_u ?? ""}|${payload.y_px_u ?? ""}|${payload.width_px_u}|${payload.height_px_u}|${payload.rotation_deg}`
    if (lastSavedSignatureRef.current === signature) return
    lastSavedSignatureRef.current = signature

    await saveImageStateApi(projectId, payload)
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
      requestSeqRef.current++
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

