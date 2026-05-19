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
  type TraceBaseImage,
} from "@/lib/api/project-trace"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"

export function useTraceHandlers(opts: {
  projectId: string
  refreshFilterImage: () => Promise<void> | void
  refreshMasterImage: () => Promise<void> | void
}) {
  const { projectId, refreshFilterImage, refreshMasterImage } = opts
  const [trace, setTrace] = useState<ProjectTrace | null>(null)
  // Cropped source bitmap that the canvas renders under the SVG
  // overlay; null for trace kinds that don't crop (lineart) or while
  // the first GET is still in flight.
  const [traceBaseImage, setTraceBaseImage] = useState<TraceBaseImage | null>(null)
  const [traceLoading, setTraceLoading] = useState(true)
  const [isApplyingTrace, setIsApplyingTrace] = useState(false)
  const [isClearingTrace, setIsClearingTrace] = useState(false)

  const refreshTrace = useCallback(async () => {
    try {
      const next = await getProjectTrace(projectId)
      setTrace(next.trace)
      setTraceBaseImage(next.baseImage)
    } catch (err) {
      console.error("Failed to load trace state:", err)
    } finally {
      setTraceLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void refreshTrace()
  }, [refreshTrace])

  const handleApplyTrace = useCallback(
    async ({
      kind,
      params,
      displayMmW,
      displayMmH,
    }: {
      kind: RegisteredTraceId
      params: Record<string, unknown>
      displayMmW?: number
      displayMmH?: number
    }) => {
      setIsApplyingTrace(true)
      try {
        await applyProjectTrace({ projectId, kind, params, displayMmW, displayMmH })
        await Promise.all([refreshTrace(), refreshFilterImage(), refreshMasterImage()])
      } finally {
        setIsApplyingTrace(false)
      }
    },
    [projectId, refreshFilterImage, refreshMasterImage, refreshTrace],
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
    traceBaseImage,
    traceLoading,
    isApplyingTrace,
    isClearingTrace,
    refreshTrace,
    handleApplyTrace,
    handleClearTrace,
  }
}
