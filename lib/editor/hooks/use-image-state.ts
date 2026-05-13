"use client"

/**
 * React hook for persisted image transform state.
 *
 * Responsibilities:
 * - Load initial image state (x/y/size/rotation) for a project.
 * - Serialize and save commits via the API with coalescing/inflight protection.
 *
 * Post PR #124: state is anchored at the project's master.id server-side.
 * The hook no longer takes an image_id parameter — every project has at
 * most one state row, and the API resolves the persistence key from
 * `projectId` alone.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { getImageState, saveImageState as saveImageStateApi } from "@/lib/api/image-state"
import { ApiError } from "@/lib/api/api-error"
import { parseBigIntString, toSaveImageStateBody } from "@/lib/editor/imageState"
import { reportClientError } from "@/lib/monitoring/with-error-reporting"

export type ImageState = {
  xPxU?: bigint
  yPxU?: bigint
  widthPxU?: bigint
  heightPxU?: bigint
  rotationDeg: number
}

type Pending<T> = { seq: number; value: T }

/**
 * Stable equality key for a transform payload. Used by load- and save-
 * path dedup refs; equivalent strings mean "nothing new to apply/persist".
 * Cheap concat avoids JSON.stringify GC churn on the save-coalesce path.
 */
function buildTransformSignature(p: {
  x_px_u?: string | null | undefined
  y_px_u?: string | null | undefined
  width_px_u: string
  height_px_u: string
  rotation_deg: number | string
}): string {
  return `${p.x_px_u ?? ""}|${p.y_px_u ?? ""}|${p.width_px_u}|${p.height_px_u}|${p.rotation_deg}`
}

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

/**
 * React hook owning the project-wide image transform state.
 *
 * @param projectId — used as the API route key and the log prefix.
 * @param enabled — when false, the hook resets to empty and stops
 *   listening. Wraps the canvas-source-ready signal in callers.
 * @param initial — SSR-provided seed for `initialImageTransform`.
 *   When present, the mount auto-load is skipped (no extra round-trip
 *   on first paint).
 * @param autoLoad — when true (default) and no `initial` is supplied,
 *   the hook fetches the current state on mount. Set to false only if
 *   the caller drives `loadImageState()` explicitly.
 *
 * Returns:
 * - `initialImageTransform` — seed for the canvas placement controller.
 * - `imageStateError`, `imageStateLoading` — UI gating signals.
 * - `loadImageState()` — manual reload (rarely needed post-#124).
 * - `saveImageState(t)` — enqueue + flush a transform write. Saves are
 *   coalesced via a pending-slot; the latest payload wins.
 *
 * Persistence model: state is anchored at the project's `master.id`
 * (PR #124). The API resolves the key from `projectId` alone, so the
 * hook needs no image-id input. See
 * `docs/specs/image-state-api.mdx` for the wire contract and
 * `docs/domains/image-state.md` for the anchor rationale.
 */
export function useImageState(projectId: string, enabled: boolean, initial?: ImageState | null, autoLoad = true) {
  const [initialImageTransform, setInitialImageTransform] = useState<ImageState | null>(() => initial ?? null)
  const [imageStateLoading, setImageStateLoading] = useState(false)

  const logPrefix = useMemo(() => `[image-state:${projectId}]`, [projectId])

  const lastSavedSignatureRef = useRef<string | null>(null)
  const lastLoadedSignatureRef = useRef<string | null>(null)
  const pendingSlotRef = useRef<ReturnType<typeof createPendingSlot<ImageState>> | null>(null)
  if (!pendingSlotRef.current) pendingSlotRef.current = createPendingSlot<ImageState>()
  const inflightRef = useRef<Promise<void> | null>(null)
  const loadInflightRef = useRef<Promise<void> | null>(null)
  const requestSeqRef = useRef(0)

  const loadImageState = useCallback(async () => {
    if (loadInflightRef.current) return await loadInflightRef.current
    const p = (async () => {
    const seq = ++requestSeqRef.current
    setImageStateLoading(true)
    try {
      const payload = await getImageState(projectId)
      if (seq !== requestSeqRef.current) return
      if (!payload?.exists) {
        if (lastLoadedSignatureRef.current === "__missing__") return
        lastLoadedSignatureRef.current = "__missing__"
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
      const nextSig = buildTransformSignature(payload.state)
      if (lastLoadedSignatureRef.current === nextSig) return
      lastLoadedSignatureRef.current = nextSig
      setInitialImageTransform({
        xPxU: xPxU ?? undefined,
        yPxU: yPxU ?? undefined,
        widthPxU,
        heightPxU,
        rotationDeg: Number(payload.state.rotation_deg),
      })
    } catch (e) {
      if (seq !== requestSeqRef.current) return
      if (e instanceof ApiError) {
        const stage = typeof e.payload?.stage === "string" ? e.payload.stage : null
        const payloadError = typeof e.payload?.error === "string" ? e.payload.error : null
        console.error(`${logPrefix} load failed`, { code: e.code, status: e.status, stage, payloadError, payload: e.payload })
      } else {
        console.error(`${logPrefix} load failed`, e)
      }
      reportClientError(e, {
        scope: "editor",
        code: "IMAGE_STATE_LOAD_FAILED",
        stage: "load",
        context: { projectId },
      })
      lastLoadedSignatureRef.current = null
      setInitialImageTransform(null)
    } finally {
      if (seq !== requestSeqRef.current) return
      setImageStateLoading(false)
    }
    })()
    loadInflightRef.current = p
    try {
      await p
    } finally {
      loadInflightRef.current = null
    }
  }, [logPrefix, projectId])

  const flushOnce = useCallback(async (p: Pending<ImageState>): Promise<void> => {
    const t = p.value

    if (!t.widthPxU || !t.heightPxU) {
      // Drop invalid pending entries so the flush loop can terminate.
      pendingSlotRef.current?.clearIfSeq(p.seq)
      return
    }

    const payload = toSaveImageStateBody({
      xPxU: t.xPxU,
      yPxU: t.yPxU,
      widthPxU: t.widthPxU,
      heightPxU: t.heightPxU,
      rotationDeg: t.rotationDeg,
    })

    const signature = buildTransformSignature(payload)
    if (lastSavedSignatureRef.current === signature) {
      // Duplicate payload for the same pending seq: clear it to avoid re-reading
      // the same snapshot forever in the coalescing flush loop.
      pendingSlotRef.current?.clearIfSeq(p.seq)
      return
    }

    await saveImageStateApi(projectId, payload)
    // Mark as saved only after a successful write. Otherwise retries with the
    // same payload would be incorrectly deduped after transient failures.
    lastSavedSignatureRef.current = signature
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
      } catch (e) {
        if (e instanceof ApiError) {
          const stage = typeof e.payload?.stage === "string" ? e.payload.stage : null
          const payloadError = typeof e.payload?.error === "string" ? e.payload.error : null
          console.error(`${logPrefix} save failed`, { code: e.code, status: e.status, stage, payloadError, payload: e.payload })
        } else {
          console.error(`${logPrefix} save failed`, e)
        }
        reportClientError(e, {
          scope: "editor",
          code: "IMAGE_STATE_SAVE_FAILED",
          stage: "save",
          context: { projectId },
        })
      }
    },
    [flush, logPrefix, projectId]
  )

  useEffect(() => {
    // Defer to a microtask so the synchronous setState calls (reset on
    // disable, load-on-mount via loadImageState) run outside the effect
    // body — the eslint rule react-hooks/set-state-in-effect is
    // otherwise tripped.
    if (!enabled) {
      requestSeqRef.current++
      loadInflightRef.current = null
      lastLoadedSignatureRef.current = null
      queueMicrotask(() => {
        setInitialImageTransform(null)
        setImageStateLoading(false)
      })
      return
    }
    // If server already provided the state, skip initial fetch.
    if (initial || !autoLoad) return
    queueMicrotask(() => {
      void loadImageState()
    })
  }, [autoLoad, enabled, initial, loadImageState])

  useEffect(() => {
    return () => {
      pendingSlotRef.current?.clearAll()
    }
  }, [])

  return { initialImageTransform, imageStateLoading, loadImageState, saveImageState }
}
