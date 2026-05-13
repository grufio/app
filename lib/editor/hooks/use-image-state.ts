"use client"

/**
 * React hook for the persisted image-transform save path.
 *
 * The hook owns **only** the save side: a pending-slot that coalesces
 * rapid canvas commits and a flush pump that serialises writes to
 * `POST /api/projects/[projectId]/image-state`.
 *
 * The seed (`initial`) is the SSR snapshot of `project_image_state`
 * fetched by the page server component and is returned **as a direct
 * passthrough** — the hook does not copy it into local React state.
 * That was the source of the long-standing "always default size on
 * reopen" bug: an earlier design held `initial` in `useState`,
 * combined with an `enabled` lifecycle flag that wiped the seed when
 * the canvas source wasn't ready yet. Removing the local state makes
 * that bug class structurally impossible — there is no slot to wipe.
 *
 * What lives elsewhere now:
 * - SSR fetch: `services/editor/server/image-state.ts` →
 *   `app/projects/[projectId]/page.tsx`.
 * - Canvas application of the seed:
 *   `features/editor/components/canvas-stage/initial-placement-controller.ts`.
 * - Persistence wire format: `lib/editor/imageState/`.
 *
 * Post PR #124 the state row is anchored at the project's `master.id`
 * server-side, so the hook still needs no image-id input.
 */
import { useCallback, useEffect, useRef } from "react"

import { saveImageState as saveImageStateApi } from "@/lib/api/image-state"
import { ApiError } from "@/lib/api/api-error"
import { toSaveImageStateBody } from "@/lib/editor/imageState"
import { reportClientError } from "@/lib/monitoring/with-error-reporting"

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
 * @param initial — SSR-provided transform seed. Returned unchanged as
 *   `initialImageTransform`. The hook never mutates or stores it.
 *
 * Returns:
 * - `initialImageTransform` — the seed, passed through verbatim.
 * - `saveImageState(t)` — enqueue + flush a transform write. Saves are
 *   coalesced via a pending-slot; the latest payload wins. Errors are
 *   logged + reported via `reportClientError` and otherwise swallowed
 *   (the canvas remains responsive; the workflow machine surfaces the
 *   persistence error separately for UI).
 */
export function useImageState(projectId: string, initial: ImageState | null) {
  const lastSavedSignatureRef = useRef<string | null>(null)
  const pendingSlotRef = useRef<ReturnType<typeof createPendingSlot<ImageState>> | null>(null)
  if (!pendingSlotRef.current) pendingSlotRef.current = createPendingSlot<ImageState>()
  const inflightRef = useRef<Promise<void> | null>(null)

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

    await saveImageStateApi(projectId, payload)
    // Mark as saved only after a successful write. Otherwise retries with the
    // same payload would be incorrectly deduped after transient failures.
    lastSavedSignatureRef.current = signature
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
        pendingSlotRef.current?.set(t)
        await flush()
      } catch (e) {
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

  useEffect(() => {
    return () => {
      pendingSlotRef.current?.clearAll()
    }
  }, [])

  return { initialImageTransform: initial, saveImageState }
}
