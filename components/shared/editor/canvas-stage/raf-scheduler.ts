/**
 * requestAnimationFrame scheduler (pure-ish).
 *
 * Responsibilities:
 * - Coalesce multiple flags into a single RAF callback per frame.
 * - Provide an explicit `dispose()` to cancel pending work.
 */
export const RAF_PAN = 1
export const RAF_BOUNDS = 2
export const RAF_DRAG_BOUNDS = 4

export type RafSchedulerHandlers = {
  onPan: () => void
  onDragBounds: () => void
  onBounds: () => void
  /**
   * Counter hook: increments when a new RAF is scheduled (one per frame at most).
   * Intended for dev/E2E performance guardrails.
   */
  onRafScheduled?: () => void
  /**
   * Counter hook: increments when the RAF callback executes.
   * Intended for dev/E2E performance guardrails.
   */
  onRafExecuted?: () => void
}

export type RafScheduler = {
  schedule: (flag: number) => void
  dispose: () => void
}

/**
 * Single RAF scheduler to batch work per frame.
 * Pure scheduling/flag coalescing; handlers own state updates.
 */
export function createRafScheduler(handlers: RafSchedulerHandlers): RafScheduler {
  let rafId: number | null = null
  let flags = 0

  const schedule = (flag: number) => {
    flags |= flag
    if (rafId != null) return
    handlers.onRafScheduled?.()
    rafId = requestAnimationFrame(() => {
      rafId = null
      handlers.onRafExecuted?.()
      const f = flags
      flags = 0

      if (f & RAF_PAN) handlers.onPan()
      if (f & RAF_DRAG_BOUNDS) handlers.onDragBounds()
      if (f & RAF_BOUNDS) handlers.onBounds()
    })
  }

  const dispose = () => {
    if (rafId != null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    flags = 0
  }

  return { schedule, dispose }
}

