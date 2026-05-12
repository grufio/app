/**
 * Promise-wrap an xstate actor subscription: resolve/reject based on
 * predicates over emitted snapshots, with a hard timeout.
 *
 * Lifecycle invariants this helper enforces:
 * - The subscription is unsubscribed on success, error, AND timeout.
 * - `sub` is captured in a closure-scoped `let` declared **before** the
 *   timeout, so the timeout-callback can safely reference it even if
 *   `actor.subscribe()` throws synchronously (no TDZ ReferenceError).
 * - `onSettle` runs on resolve and reject (incl. timeout), useful for
 *   clearing caller-side caches before the promise transitions.
 */

export type AnyActorLike<S> = {
  subscribe: (next: (snapshot: S) => void) => { unsubscribe: () => void }
}

export type WaitForStateChangeArgs<S> = {
  actor: AnyActorLike<S>
  timeoutMs: number
  /** Return null to keep waiting, `"resolve"` to settle, or `Error` to reject. */
  evaluate: (snapshot: S) => null | "resolve" | Error
  timeoutMessage: string
  /** Called exactly once when the promise settles (resolve, reject, or
   * timeout). Use this to clear caller-side caches. */
  onSettle?: () => void
}

export function waitForStateChange<S>(args: WaitForStateChangeArgs<S>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false
    let sub: { unsubscribe: () => void } | null = null

    const settle = (action: "resolve" | { reject: Error }) => {
      if (settled) return
      settled = true
      globalThis.clearTimeout(timeout)
      sub?.unsubscribe()
      args.onSettle?.()
      if (action === "resolve") resolve()
      else reject(action.reject)
    }

    const timeout = globalThis.setTimeout(() => {
      settle({ reject: new Error(args.timeoutMessage) })
    }, args.timeoutMs)

    try {
      sub = args.actor.subscribe((snapshot) => {
        if (settled) return
        const verdict = args.evaluate(snapshot)
        if (verdict === "resolve") settle("resolve")
        else if (verdict instanceof Error) settle({ reject: verdict })
      })
    } catch (err) {
      settle({ reject: err instanceof Error ? err : new Error(String(err)) })
    }
  })
}
