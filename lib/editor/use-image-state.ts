"use client"

/**
 * React hook for persisted image transform state.
 *
 * Responsibilities:
 * - Load initial image state (x/y/size/rotation) for a project role.
 * - Serialize and save commits via the API with coalescing/inflight protection.
 */
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

type Pending<T> = { seq: number; value: T }

/**
 * A tiny pending-slot helper that is safe against the “set while flushing” race:
 * it never clears a newer value while completing an older flush.
 *
 * Exported for unit testing.
 */
export function createPendingSlot<T>() {
  const seqRef = { current: 0 }
  const slotRef = { current: null as Pending<T> | null }
  return {
    set(value: T) {
      const seq = ++seqRef.current
      slotRef.current = { seq, value }
      return seq
    },
    snapshot(): Pending<T> | null {
      return slotRef.current
    },
    clearIfSeq(seq: number) {
      const cur = slotRef.current
      if (cur && cur.seq === seq) {
        slotRef.current = null
        return true
      }
      return false
    },
    clearAll() {
      slotRef.current = null
    },
  }
}

export function useImageState(projectId: string, enabled: boolean, initial?: ImageState | null) {
  const [initialImageTransform, setInitialImageTransform] = useState<ImageState | null>(() => initial ?? null)
  const [imageStateError, setImageStateError] = useState("")
  const [imageStateLoading, setImageStateLoading] = useState(false)

  const logPrefix = useMemo(() => `[image-state:${projectId}]`, [projectId])

  const lastSavedSignatureRef = useRef<string | null>(null)
  const pendingSlotRef = useRef<ReturnType<typeof createPendingSlot<ImageState>> | null>(null)
  if (!pendingSlotRef.current) pendingSlotRef.current = createPendingSlot<ImageState>()
  const inflightRef = useRef<Promise<void> | null>(null)
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

  const flushOnce = useCallback(async (p: Pending<ImageState>): Promise<void> => {
    const t = p.value

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
    // Only clear if this is still the latest pending value.
    pendingSlotRef.current?.clearIfSeq(p.seq)
  }, [projectId])

  const flush = useCallback(async (): Promise<void> => {
    if (inflightRef.current) return await inflightRef.current
    const p = (async () => {
      // Coalesce: if new commits arrive while a request is in-flight,
      // run another pass after it finishes.
      for (;;) {
        const snap = pendingSlotRef.current?.snapshot() ?? null
        if (!snap) return
        await flushOnce(snap)
      }
    })()
    inflightRef.current = p
    try {
      await p
    } finally {
      inflightRef.current = null
    }
  }, [flushOnce])

  const saveImageState = useCallback(
    async (t: ImageState) => {
      try {
        // Persist immediately. Any debouncing/throttling belongs in the caller
        // (canvas interactions), not in this IO hook.
        pendingSlotRef.current?.set(t)
        await flush()
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
    // If server already provided the state, skip initial fetch.
    if (initial) return
    void loadImageState()
  }, [enabled, initial, loadImageState])

  useEffect(() => {
    return () => {
      pendingSlotRef.current?.clearAll()
    }
  }, [])

  return { initialImageTransform, imageStateError, imageStateLoading, loadImageState, saveImageState }
}

