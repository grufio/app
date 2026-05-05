export type CommitScheduler = {
  cancel: () => void
  schedule: (commitPosition: boolean, delayMs?: number) => void
}

export function createCommitScheduler(onFlush: (commitPosition: boolean) => void): CommitScheduler {
  let commitTimer: ReturnType<typeof setTimeout> | null = null
  let pending: { commitPosition: boolean } | null = null

  const cancel = () => {
    if (commitTimer != null) {
      globalThis.clearTimeout(commitTimer)
      commitTimer = null
    }
    pending = null
  }

  const schedule = (commitPosition: boolean, delayMs = 150) => {
    pending = pending ? { commitPosition: pending.commitPosition || commitPosition } : { commitPosition }
    if (commitTimer != null) {
      globalThis.clearTimeout(commitTimer)
      commitTimer = null
    }
    commitTimer = globalThis.setTimeout(() => {
      commitTimer = null
      const p = pending
      pending = null
      if (!p) return
      onFlush(p.commitPosition)
    }, delayMs)
  }

  return { cancel, schedule }
}
