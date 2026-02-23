/**
 * Small serial write channel with "latest pending wins" semantics.
 *
 * Use this for UI-originated mutations where overlapping requests can
 * otherwise reorder state and cause stale writes to win.
 */
export function createSerialWriteChannel() {
  let running = false
  let pending: (() => Promise<void>) | null = null

  const runLoop = async () => {
    if (running) return
    running = true
    try {
      while (pending) {
        const task = pending
        pending = null
        await task()
      }
    } finally {
      running = false
    }
  }

  return {
    enqueueLatest<T>(task: () => Promise<T>): Promise<T> {
      const out = new Promise<T>((resolve, reject) => {
        pending = async () => {
          try {
            const out = await task()
            resolve(out)
          } catch (e) {
            reject(e)
          }
        }
      })
      void runLoop()
      return out
    },
    // Fire-and-forget variant for callers that don't need a result.
    enqueueLatestVoid(task: () => Promise<void>) {
      pending = task
      void runLoop()
    },
  }
}

