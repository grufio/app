"use client"

/**
 * The single authoritative display-size source (Invariant 1).
 *
 * One hook owns the image's display transform (x/y/width/height + rotation,
 * µpx) for the project. There is exactly one source of truth that the
 * canvas, the trace dialog, and the right-panel readout all read:
 * `displayTxU`.
 *
 * Source-of-truth lifecycle:
 *   - **Seed:** SSR-provided `initial` (the working_copy-anchored
 *     `project_image_state` row, fetched server-side in
 *     `services/editor/server/image-state.ts`).
 *   - **Live update:** real user canvas edits only. The canvas reports a
 *     committed transform via `handleImageTransformChange` (drag, resize,
 *     align, fit → commit). Render / system / apply-refresh / re-placement
 *     never feed this — the value-equality short-circuit also drops
 *     identical re-reports so the canvas reporting an unchanged frame is
 *     a no-op.
 *   - **Master transition (in-session):** master delete/replace runs
 *     without a page reload, so there is no fresh SSR seed. Instead of
 *     collapsing to null (the old mirror's failure mode that triggered a
 *     silent intrinsic fallback), the hook *re-seeds from the source* —
 *     a targeted GET of the new working_copy's persisted state. A master
 *     delete (`masterImageId === null`) clears to null: no state, no
 *     working copy → the canvas does a fresh-upload intrinsic placement.
 *
 * Write rule (why the corruption loop is constructively impossible):
 *   The ONLY path that writes `project_image_state` is `saveImageState`,
 *   and it is fed exclusively by user-edit commits (the workflow machine's
 *   `saveTransform`) and the trace-apply pre-save (`getCurrentImageTx`).
 *   The re-seed read writes only the local `displayTxU`, never the DB. So
 *   render/system/apply/re-placement can never round-trip back into the
 *   persisted row.
 *
 * History: this hook replaces TWO reset-prone mirrors that diverged for a
 * single logical size — `use-canvas-tx-mirror` (`imageTxU` +
 * `initialImageTxU` + `deriveInitialImageTxU`) and the
 * `persistedTransform` mirror inside the old `use-image-state` (both keyed
 * to null on `masterImageId`). Collapsing them into one source removes the
 * "always default size after a master transition" bug class at the root.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react"

import { getImageState, saveImageState as saveImageStateApi } from "@/lib/api/image-state"
import { ApiError } from "@/lib/api/api-error"
import type { ProjectCanvasStageHandle } from "@/features/editor"
import { parseBigIntString, toSaveImageStateBody, type ImageState } from "@/lib/editor/imageState"
import { reportClientError } from "@/lib/monitoring/with-error-reporting"
import { useUpdateEffect } from "@/lib/react/use-update-effect"

export type { ImageState } from "@/lib/editor/imageState"

/** Display transform tuple consumed by canvas/dialog/right-panel. */
export type DisplayTxU = { x: bigint; y: bigint; w: bigint; h: bigint }

type Pending<T> = { seq: number; value: T }

function buildTransformSignature(p: {
  x_px_u?: string | null | undefined
  y_px_u?: string | null | undefined
  width_px_u: string
  height_px_u: string
  rotation_deg: number | string
}): string {
  return `${p.x_px_u ?? ""}|${p.y_px_u ?? ""}|${p.width_px_u}|${p.height_px_u}|${p.rotation_deg}`
}

function isAbortError(e: unknown): boolean {
  return e instanceof Error && e.name === "AbortError"
}

/**
 * Convert an `ImageState` (the seed / save shape, with optional position)
 * into the `DisplayTxU` tuple. Returns null when width/height are absent
 * or non-positive — i.e. there is no usable persisted size yet.
 */
export function imageStateToDisplayTxU(state: ImageState | null | undefined): DisplayTxU | null {
  if (!state) return null
  const w = state.widthPxU
  const h = state.heightPxU
  if (!w || !h || w <= 0n || h <= 0n) return null
  return { x: state.xPxU ?? 0n, y: state.yPxU ?? 0n, w, h }
}

/**
 * A tiny pending-slot helper that is safe against the “set while flushing”
 * race: it never clears a newer value while completing an older flush.
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
 * @param projectId — route key for the API + log prefix.
 * @param masterImageId — the active master row's id (the immutable
 *   kind='master' row id), or `null` when no master exists. This is the
 *   STABLE identity: it does NOT flip on filter/crop/trace apply, only on
 *   a real master delete/replace. On change, the hook re-seeds the display
 *   size from the DB (replace) or clears it (delete), and aborts in-flight
 *   saves.
 * @param initial — SSR-provided transform seed (working_copy-anchored
 *   row). First-mount value of the authoritative source.
 * @param canvasRef — handle for the nudge dispatch.
 */
export function useDisplaySize(args: {
  projectId: string
  masterImageId: string | null
  initial: ImageState | null
  canvasRef: RefObject<ProjectCanvasStageHandle | null>
}) {
  const { projectId, masterImageId, initial, canvasRef } = args

  // The single authoritative display transform. Seeded from SSR; updated
  // only by user-edit commits and by the master-transition re-seed.
  const [displayTxU, setDisplayTxU] = useState<DisplayTxU | null>(() => imageStateToDisplayTxU(initial))
  // Rotation is carried alongside so the trace-apply pre-save and the
  // canvas placement keep the persisted rotation. Width/height/x/y live in
  // displayTxU; rotation is rarely read but must round-trip.
  const rotationRef = useRef<number>(initial?.rotationDeg ?? 0)

  // Save-side state (the only DB-writing path).
  const lastSavedSignatureRef = useRef<string | null>(null)
  const pendingSlotRef = useRef<ReturnType<typeof createPendingSlot<ImageState>> | null>(null)
  if (!pendingSlotRef.current) pendingSlotRef.current = createPendingSlot<ImageState>()
  const inflightRef = useRef<Promise<void> | null>(null)
  const inflightControllersRef = useRef<Set<AbortController>>(new Set())
  const mountedRef = useRef(true)
  const reseedTokenRef = useRef(0)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const flushOnce = useCallback(async (p: Pending<ImageState>): Promise<void> => {
    const t = p.value

    if (!t.widthPxU || !t.heightPxU) {
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
      pendingSlotRef.current?.clearIfSeq(p.seq)
      return
    }

    const controller = new AbortController()
    inflightControllersRef.current.add(controller)
    try {
      await saveImageStateApi(projectId, payload, { signal: controller.signal })
    } catch (e) {
      if (isAbortError(e)) {
        // Master changed mid-flight (or component unmounted) → the
        // reset already cleared the slot; the in-flight save is
        // discarded by design. Don't promote to error report.
        pendingSlotRef.current?.clearIfSeq(p.seq)
        return
      }
      throw e
    } finally {
      inflightControllersRef.current.delete(controller)
    }

    // Mark as saved only after a successful write. Otherwise retries with
    // the same payload would be incorrectly deduped after transient
    // failures.
    lastSavedSignatureRef.current = signature
    pendingSlotRef.current?.clearIfSeq(p.seq)
  }, [projectId])

  const flush = useCallback(async (): Promise<void> => {
    if (inflightRef.current) return await inflightRef.current
    const p = (async () => {
      // Coalesce: if new commits arrive while a request is in-flight, run
      // another pass after it finishes.
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
      // The committed transform is the user's edit. The live
      // `onImageTransformChange` feed carries x/y/w/h only (no rotation),
      // so track the rotation from the save payload here — that keeps
      // `getCurrentImageState` (used by the trace-apply pre-save) in sync
      // with the user's current rotation instead of the stale seed value.
      // This is still a user-edit write, not a system write-back.
      if (typeof t.rotationDeg === "number" && Number.isFinite(t.rotationDeg)) {
        rotationRef.current = t.rotationDeg
      }
      try {
        pendingSlotRef.current?.set(t)
        await flush()
      } catch (e) {
        if (isAbortError(e)) return
        if (e instanceof ApiError) {
          const stage = typeof e.payload?.stage === "string" ? e.payload.stage : null
          const payloadError = typeof e.payload?.error === "string" ? e.payload.error : null
          console.error(`[image-state:${projectId}] save failed`, { code: e.code, status: e.status, stage, payloadError, payload: e.payload })
        } else {
          console.error(`[image-state:${projectId}] save failed`, e)
        }
        reportClientError(e, {
          scope: "editor",
          code: "IMAGE_STATE_SAVE_FAILED",
          stage: "save",
          context: { projectId },
        })
      }
    },
    [flush, projectId]
  )

  // Live update from a real user canvas commit. This is the ONLY path
  // (besides the master-transition re-seed) that mutates the authoritative
  // source — and the equality short-circuit drops identical reports so an
  // unchanged canvas frame doesn't churn consumers.
  const handleImageTransformChange = useCallback(
    (tx: { xPxU: bigint; yPxU: bigint; widthPxU: bigint; heightPxU: bigint } | null) => {
      setDisplayTxU((prev) => {
        if (!tx) return null
        const next: DisplayTxU = { x: tx.xPxU, y: tx.yPxU, w: tx.widthPxU, h: tx.heightPxU }
        if (prev && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h) return prev
        return next
      })
    },
    []
  )

  const handleNudge = useCallback(
    (dxPx: number, dyPx: number) => {
      setDisplayTxU((cur) => {
        if (!cur) return cur
        const dxPxU = BigInt(Math.round(dxPx)) * 1_000_000n
        const dyPxU = BigInt(Math.round(dyPx)) * 1_000_000n
        canvasRef.current?.setImagePosition({ xPxU: cur.x + dxPxU, yPxU: cur.y + dyPxU })
        return cur
      })
    },
    [canvasRef]
  )

  // Snapshot of the authoritative transform in the save/ImageState shape.
  // Used by the trace-apply pre-save (closes the resize→apply race) and as
  // a convenience for callers needing the full transform incl. rotation.
  const getCurrentImageState = useCallback((): ImageState | null => {
    if (!displayTxU) return null
    return {
      xPxU: displayTxU.x,
      yPxU: displayTxU.y,
      widthPxU: displayTxU.w,
      heightPxU: displayTxU.h,
      rotationDeg: rotationRef.current,
    }
  }, [displayTxU])

  // Unmount cleanup: abort in-flight saves so their resolved promises don't
  // touch a dead component. Snapshot the refs locally — they are stable
  // (created once, never reassigned), but the lint rule wants the read
  // pinned at effect-setup time rather than at cleanup time.
  useEffect(() => {
    const pendingSlot = pendingSlotRef.current
    const controllers = inflightControllersRef.current
    return () => {
      pendingSlot?.clearAll()
      for (const c of controllers) c.abort()
      controllers.clear()
    }
  }, [])

  // Master transition (delete / replace), in-session — fires only on
  // updates, never on initial mount (the SSR seed already populated the
  // source). Abort in-flight saves + clear pending, then re-seed the
  // authoritative source from the DB instead of collapsing to null.
  useUpdateEffect(() => {
    for (const c of inflightControllersRef.current) c.abort()
    inflightControllersRef.current.clear()
    pendingSlotRef.current?.clearAll()
    lastSavedSignatureRef.current = null

    // Master delete → no working copy, no state. Clear so the canvas does
    // a fresh-upload intrinsic placement.
    if (!masterImageId) {
      reseedTokenRef.current += 1
      setDisplayTxU(null)
      rotationRef.current = 0
      return
    }

    // Master replace → a brand-new working copy with its own (possibly
    // freshly-seeded) state. Re-fetch the authoritative size; a stale
    // token (another transition raced ahead) discards the late response.
    const token = ++reseedTokenRef.current
    void (async () => {
      try {
        const res = await getImageState(projectId)
        if (!mountedRef.current || reseedTokenRef.current !== token) return
        if (!res.exists) {
          setDisplayTxU(null)
          rotationRef.current = 0
          return
        }
        const next: ImageState = {
          xPxU: parseBigIntString(res.state.x_px_u) ?? undefined,
          yPxU: parseBigIntString(res.state.y_px_u) ?? undefined,
          widthPxU: parseBigIntString(res.state.width_px_u) ?? undefined,
          heightPxU: parseBigIntString(res.state.height_px_u) ?? undefined,
          rotationDeg: Number(res.state.rotation_deg ?? 0),
        }
        rotationRef.current = next.rotationDeg
        setDisplayTxU(imageStateToDisplayTxU(next))
      } catch (e) {
        if (!mountedRef.current || reseedTokenRef.current !== token) return
        // A failed re-seed must not leave a stale size masquerading as the
        // new master's. Clear to null (fresh-upload placement) and report.
        setDisplayTxU(null)
        rotationRef.current = 0
        reportClientError(e, {
          scope: "editor",
          code: "IMAGE_STATE_RESEED_FAILED",
          stage: "load",
          context: { projectId },
        })
      }
    })()
  }, [masterImageId])

  return {
    /** The single authoritative display transform. */
    displayTxU,
    /** Feed to `ProjectCanvasStage.onImageTransformChange`. */
    handleImageTransformChange,
    /** Arrow-key nudge handler. */
    handleNudge,
    /** Full transform incl. rotation, in ImageState shape, or null. */
    getCurrentImageState,
    /** Await-able persisted save. Fed only by user-edit commits + trace apply. */
    saveImageState,
  }
}
