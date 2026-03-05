/**
 * Small serial write channel with "latest pending wins" semantics.
 *
 * Use this for UI-originated mutations where overlapping requests can
 * otherwise reorder state and cause stale writes to win.
 */
export class SupersededWriteError extends Error {
  constructor() {
    super("Write task superseded by a newer enqueue")
    this.name = "SupersededWriteError"
  }
}

export function isSupersededWriteError(error: unknown): error is SupersededWriteError {
  return error instanceof SupersededWriteError
}

export function createSerialWriteChannel() {
  type PendingTask = {
    run: () => Promise<void>
    onSuperseded: () => void
  }
  let running = false
  let pending: PendingTask | null = null
  let latestToken = 0

  const runLoop = async () => {
    if (running) return
    running = true
    try {
      while (pending) {
        const task = pending.run
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
        const nextPending: PendingTask = {
          run: async () => {
            try {
              const out = await task()
              resolve(out)
            } catch (e) {
              reject(e)
            }
          },
          onSuperseded: () => reject(new SupersededWriteError()),
        }
        pending?.onSuperseded()
        pending = nextPending
      })
      void runLoop()
      return out
    },
    /**
     * Like `enqueueLatest`, but callers can safely treat superseded writes as "aborted":
     * - When a newer task is enqueued, older in-flight tasks still run, but their results/errors are ignored.
     * - The returned promise resolves to `null` when the task became stale.
     */
    enqueueLatestDropStale<T>(task: (isStale: () => boolean) => Promise<T>): Promise<T | null> {
      const token = ++latestToken
      const isStale = () => token !== latestToken
      const out = new Promise<T | null>((resolve, reject) => {
        const nextPending: PendingTask = {
          run: async () => {
            try {
              const out = await task(isStale)
              resolve(isStale() ? null : out)
            } catch (e) {
              if (isStale()) resolve(null)
              else reject(e)
            }
          },
          onSuperseded: () => resolve(null),
        }
        pending?.onSuperseded()
        pending = nextPending
      })
      void runLoop()
      return out
    },
    // Fire-and-forget variant for callers that don't need a result.
    enqueueLatestVoid(task: () => Promise<void>) {
      pending = {
        run: task,
        onSuperseded: () => undefined,
      }
      void runLoop()
    },
  }
}

