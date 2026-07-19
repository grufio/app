"use client"

/**
 * Trace read model for the editor shell — fetches the single-row-per-project
 * trace and exposes it plus a refresher.
 *
 * The trace MUTATIONS (apply / clear) live in the image-workflow state machine
 * (`use-image-workflow-machine.ts`, via `use-editor-workflow-adapter.ts`), so
 * they run through the same `mutating → syncing → idle` flow as filter/crop/
 * restore. `refreshTrace` is handed to the adapter and joins the machine's
 * `refreshAll`, so `trace`/`hasTrace` stay consistent after every mutation.
 */
import { useCallback, useEffect, useState } from "react"

import { getProjectTrace, type ProjectTrace } from "@/lib/api/project-trace"

export function useTraceHandlers(opts: { projectId: string }) {
  const { projectId } = opts
  const [trace, setTrace] = useState<ProjectTrace | null>(null)
  const [traceLoading, setTraceLoading] = useState(true)

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

  // Fetch-on-mount. The setState calls inside `refreshTrace` are the result of a
  // real async side effect (GET /trace), not a derived-state computation.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshTrace()
  }, [refreshTrace])

  return {
    trace,
    traceLoading,
    refreshTrace,
  }
}
