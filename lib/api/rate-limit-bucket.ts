/**
 * In-memory fixed-window rate limiter with bounded memory.
 *
 * Module-scope Maps in API routes are per-serverless-instance and, if never
 * pruned, grow without bound: one entry per distinct key (e.g. client IP)
 * that ever calls, forever — a slow leak because a one-shot key's entry is
 * only overwritten if that same key returns. This limiter closes both leaks:
 *
 *   1. Time sweep: at most once per window, drop every entry whose window has
 *      elapsed. Bounds the map to "distinct keys seen in the last ~2 windows"
 *      under normal traffic.
 *   2. Hard cap: a backstop against a burst of unique keys *within* one window
 *      (e.g. spoofed X-Forwarded-For) that the sweep can't age out yet —
 *      evict the oldest-inserted entry once `maxKeys` is exceeded.
 *
 * Fixed-window (not sliding) is intentional: cheap, good enough for a log-flood
 * noise floor, and trivially testable. `now` is injectable for deterministic
 * tests.
 */
export type RateLimiter = {
  /** Records a hit for `key`; returns true when the key is over the limit. */
  limited: (key: string) => boolean
  /** Current number of tracked keys (for tests / introspection). */
  size: () => number
}

/** Create a bounded fixed-window rate limiter (see module docs for the two eviction mechanisms). */
export function createRateLimiter(opts: {
  /** Max hits allowed per key within one window before `limited` returns true. */
  maxPerWindow: number
  /** Window length in milliseconds. */
  windowMs: number
  /** Hard cap on tracked keys; the oldest entry is evicted once exceeded. */
  maxKeys: number
  /** Clock seam (defaults to Date.now); injected in tests. */
  now?: () => number
}): RateLimiter {
  const { maxPerWindow, windowMs, maxKeys } = opts
  const now = opts.now ?? (() => Date.now())
  const buckets = new Map<string, { count: number; windowStart: number }>()
  let lastSweepAt = 0

  function sweep(t: number): void {
    for (const [key, entry] of buckets) {
      if (t - entry.windowStart > windowMs) buckets.delete(key)
    }
    lastSweepAt = t
  }

  return {
    limited(key: string): boolean {
      const t = now()
      // Amortised cleanup: sweep expired entries at most once per window.
      if (t - lastSweepAt > windowMs) sweep(t)

      const entry = buckets.get(key)
      if (!entry || t - entry.windowStart > windowMs) {
        buckets.set(key, { count: 1, windowStart: t })
        // Backstop against a single-window flood of unique keys the sweep
        // can't reach yet — evict the oldest-inserted entry (Map preserves
        // insertion order), never the key we just recorded.
        if (buckets.size > maxKeys) {
          const oldest = buckets.keys().next().value
          if (oldest !== undefined && oldest !== key) buckets.delete(oldest)
        }
        return false
      }

      entry.count += 1
      return entry.count > maxPerWindow
    },
    size(): number {
      return buckets.size
    },
  }
}
