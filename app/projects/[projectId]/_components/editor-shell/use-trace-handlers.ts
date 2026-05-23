"use client"

/**
 * Trace lifecycle handlers for the editor shell — apply / clear /
 * fetch. Lifted out of `ProjectEditorShell.client.tsx` to keep the
 * shell focused on composition.
 *
 * Trace is single-row-per-project, so a heavy hook with caching is
 * overkill — `refreshTrace` is a simple GET + setState. The hook
 * also owns the busy flags (`isApplyingTrace`, `isClearingTrace`)
 * so the shell can compose them with workflow flags for the
 * leave-guard and the add-trace gate.
 */
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { formatOperationErrorForToast, normalizeApiError } from "@/lib/api/error-normalizer"
import {
  applyProjectTrace,
  clearProjectTrace,
  getProjectTrace,
  type ProjectTrace,
} from "@/lib/api/project-trace"
import type { ImageState } from "@/lib/editor/imageState"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"

export function useTraceHandlers(opts: {
  projectId: string
  refreshFilterImage: () => Promise<void> | void
  refreshMasterImage: () => Promise<void> | void
  /** Persists the current canvas transform before the apply call.
   * Closes the resize→apply race: pixelate's server now reads the
   * master display size from `project_image_state` (authoritative),
   * so a save still in-flight when Apply fires would let the trace
   * be computed against stale dims. Awaiting saveImageState here
   * serialises the write before the apply request. No-op when the
   * mirror matches the last persisted signature (see flushOnce). */
  saveImageState: (t: ImageState) => Promise<void>
  getCurrentImageTx: () => ImageState | null
}) {
  const { projectId, refreshFilterImage, refreshMasterImage, saveImageState, getCurrentImageTx } = opts
  const [trace, setTrace] = useState<ProjectTrace | null>(null)
  const [traceLoading, setTraceLoading] = useState(true)
  const [isApplyingTrace, setIsApplyingTrace] = useState(false)
  const [isClearingTrace, setIsClearingTrace] = useState(false)

  const refreshTrace = useCallback(async () => {
    try {
      const next = await getProjectTrace(projectId)
      setTrace(next.trace)
    } catch (err) {
      console.error("Failed to load trace state:", err)
    } finally {
      setTraceLoading(false)
    }
  }, [projectId])

  // Fetch-on-mount. The setState calls inside `refreshTrace` are the
  // result of a real async side effect (GET /trace), not a derived-
  // state computation — `useSyncExternalStore` (the rule's
  // recommendation) is for subscriptions, not one-shot fetches. A
  // Suspense + `use()` migration would be the architecturally clean
  // path but reaches deep into the shell; deferring until the trace
  // surface graduates to a resource loader.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshTrace()
  }, [refreshTrace])

  const handleApplyTrace = useCallback(
    async ({
      kind,
      params,
    }: {
      kind: RegisteredTraceId
      params: Record<string, unknown>
    }) => {
      setIsApplyingTrace(true)
      try {
        const currentTx = getCurrentImageTx()
        if (currentTx) await saveImageState(currentTx)
        await applyProjectTrace({ projectId, kind, params })
        await Promise.all([refreshTrace(), refreshFilterImage(), refreshMasterImage()])
      } finally {
        setIsApplyingTrace(false)
      }
    },
    [projectId, refreshFilterImage, refreshMasterImage, refreshTrace, saveImageState, getCurrentImageTx],
  )

  const handleClearTrace = useCallback(async () => {
    setIsClearingTrace(true)
    try {
      await clearProjectTrace(projectId)
      await Promise.all([refreshTrace(), refreshFilterImage(), refreshMasterImage()])
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      const formatted = formatOperationErrorForToast(normalizeApiError(error))
      toast.error(formatted.title, formatted.detail ? { description: formatted.detail } : undefined)
    } finally {
      setIsClearingTrace(false)
    }
  }, [projectId, refreshFilterImage, refreshMasterImage, refreshTrace])

  return {
    trace,
    traceLoading,
    isApplyingTrace,
    isClearingTrace,
    refreshTrace,
    handleApplyTrace,
    handleClearTrace,
  }
}
