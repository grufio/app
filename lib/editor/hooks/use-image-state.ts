"use client"

/**
 * React hook for the persisted image-transform save path.
 *
 * The hook owns the save side (pending-slot + flush pump serialising
 * writes to `POST /api/projects/[projectId]/image-state`) **and** a
 * live mirror of the last persisted transform: starts as the SSR seed
 * (`initial`), then updates on every successful save.
 *
 * The live mirror matters when a new active image lands on the canvas
 * after the user has resized the master in-session — e.g. apply a
 * pixelate trace, the new `trace_base` image becomes active. The
 * canvas's `initial-placement-controller` re-applies the persisted
 * transform whenever the active image changes; without the mirror it
 * would see the stale SSR seed and snap the trace back to the master's
 * original placement, ignoring the user's resize.
 *
 * History note: an earlier design held `initial` in `useState` PLUS an
 * `enabled` lifecycle flag that wiped the state when the canvas source
 * wasn't ready yet — that combination produced the "always default
 * size on reopen" bug. The new wipe path is keyed on `masterImageId`
 * via `useUpdateEffect`: it fires only on structural transitions
 * (master delete, replace) — never on transient source-loading — so
 * the 2025 bug class stays fixed.
 *
 * In-flight saves carry an `AbortSignal`; on master change all
 * controllers are aborted, the browser cancels the fetch natively,
 * and the rejecting promise is filtered (no error report, no stale
 * setPersistedTransform).
 *
 * What lives elsewhere:
 * - SSR fetch: `services/editor/server/image-state.ts` →
 *   `app/projects/[projectId]/page.tsx`.
 * - Canvas application of the seed:
 *   `features/editor/components/canvas-stage/initial-placement-controller.ts`.
 * - Persistence wire format: `lib/editor/imageState/`.
 *
 * Post PR #257 the state row is anchored at the project's
 * `working_copy.id` server-side. The `masterImageId` param on the
 * client mirrors the project's image lifecycle so the in-memory
 * mirror lifecycle matches the DB lifecycle.
 */
import { useCallback, useEffect, useRef, useState } from "react"

import { saveImageState as saveImageStateApi } from "@/lib/api/image-state"
import { ApiError } from "@/lib/api/api-error"
import { toSaveImageStateBody } from "@/lib/editor/imageState"
import { reportClientError } from "@/lib/monitoring/with-error-reporting"
import { useUpdateEffect } from "@/lib/react/use-update-effect"

export type ImageState = {
  xPxU?: bigint
  yPxU?: bigint
  widthPxU?: bigint
  heightPxU?: bigint
  rotationDeg: number
}

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
 * @param projectId — route key for the API + log prefix.
 * @param masterImageId — the active master row's id, or `null` when no
 *   master exists. When this changes (= master deleted or replaced),
 *   the live mirror is reset and in-flight saves are aborted.
 * @param initial — SSR-provided transform seed. Used as the initial
 *   value of the live mirror; subsequent successful saves replace it.
 *
 * Returns:
 * - `initialImageTransform` — live mirror of the persisted transform.
 * - `saveImageState(t)` — enqueue + flush a transform write.
 */
export function useImageState(
  projectId: string,
  masterImageId: string | null,
  initial: ImageState | null,
) {
  const lastSavedSignatureRef = useRef<string | null>(null)
  const pendingSlotRef = useRef<ReturnType<typeof createPendingSlot<ImageState>> | null>(null)
  if (!pendingSlotRef.current) pendingSlotRef.current = createPendingSlot<ImageState>()
  const inflightRef = useRef<Promise<void> | null>(null)
  const inflightControllersRef = useRef<Set<AbortController>>(new Set())

  // Live mirror of the persisted transform. `initial` is only the
  // first-render seed; React's useState ignores subsequent prop
  // changes by design. The `masterImageId` useUpdateEffect handles
  // the reset on master transitions.
  const [persistedTransform, setPersistedTransform] = useState<ImageState | null>(initial)

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

    // Mark as saved only after a successful write. Otherwise retries with the
    // same payload would be incorrectly deduped after transient failures.
    lastSavedSignatureRef.current = signature
    pendingSlotRef.current?.clearIfSeq(p.seq)
    // Live-update the mirror so subsequent active-image transitions
    // adopt the user's latest persisted size instead of the SSR seed.
    setPersistedTransform({
      xPxU: t.xPxU,
      yPxU: t.yPxU,
      widthPxU: t.widthPxU,
      heightPxU: t.heightPxU,
      rotationDeg: t.rotationDeg,
    })
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

  // Unmount cleanup: abort in-flight saves so their resolved promises
  // don't call setPersistedTransform on a dead component.
  useEffect(() => {
    return () => {
      pendingSlotRef.current?.clearAll()
      for (const c of inflightControllersRef.current) c.abort()
      inflightControllersRef.current.clear()
    }
  }, [])

  // Auto-reset on master transitions (delete, replace). Fires only on
  // updates — initial mount keeps the SSR seed intact.
  useUpdateEffect(() => {
    for (const c of inflightControllersRef.current) c.abort()
    inflightControllersRef.current.clear()
    pendingSlotRef.current?.clearAll()
    lastSavedSignatureRef.current = null
    setPersistedTransform(null)
  }, [masterImageId])

  return { initialImageTransform: persistedTransform, saveImageState }
}
