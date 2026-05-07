/**
 * Convenience wrapper around `reportError` to standardise the catch-block
 * boilerplate across editor hooks and route handlers.
 *
 * Why: yesterday's sweep introduced a 4th catch-pattern in 4 hooks
 * (`reportError(...) + setError(...)`); the call-site shape was
 *
 *   void reportError(e instanceof Error ? e : new Error(String(e)), {
 *     scope: "editor",
 *     code: "...",
 *     stage: "load",
 *     severity: "warn",
 *     context: { projectId },
 *   })
 *
 * Most of that is ceremonial. `reportError` already accepts `unknown` and
 * coerces internally, default severity should be `"warn"` for client-side
 * hook failures, and the `void` is just there because the promise is
 * fire-and-forget. This helper collapses all of that to a one-liner so
 * future migrations don't drift into yet another pattern.
 *
 * Stays inside `lib/monitoring/` next to `error-reporting.ts` and
 * `error-deduper.ts` — domain neighbours, single import path.
 */
import { reportError, type ErrorEvent } from "./error-reporting"

export type ClientErrorContext = {
  /** Where in the system the error happened. Used as a top-level filter. */
  scope: NonNullable<ErrorEvent["scope"]>
  /** Stable machine-readable code (UPPER_SNAKE) for grouping. */
  code: string
  /** Optional sub-stage within the operation (e.g. "load", "save"). */
  stage?: string
  /** Defaults to `"warn"` — most hook-level failures aren't user-fatal. */
  severity?: NonNullable<ErrorEvent["severity"]>
  /** Free-form data attached to the event. Keep PII out. */
  context?: Record<string, unknown>
  tags?: Record<string, string>
}

/**
 * Fire-and-forget error report from a client-side catch block.
 *
 * Always returns synchronously; the underlying ingest POST is not awaited.
 * Equivalent to `void reportError(error, { severity: "warn", ...ctx })`.
 */
export function reportClientError(error: unknown, ctx: ClientErrorContext): void {
  void reportError(error, {
    scope: ctx.scope,
    code: ctx.code,
    stage: ctx.stage,
    severity: ctx.severity ?? "warn",
    context: ctx.context,
    tags: ctx.tags,
  })
}
