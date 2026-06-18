/**
 * Canonical operation-error shape carried through the server-and-client
 * boundary.
 *
 * Closes S-S1 from the editor-stack review: previously the chain had
 * three separate string-only error states (`ApiError → imageStateError
 * → workflowFilterPanelError`) with no correlation id and no canonical
 * stage taxonomy.
 *
 * This file establishes the type + helpers. PR-6a wires it through
 * the server emission and the API-error normaliser; PR-6b migrates
 * the editor's React state slots to carry the shape end-to-end.
 *
 * Stage taxonomy: stages are short snake_case tokens emitted by the
 * server (e.g. `validation`, `schema_missing`, `master_lookup`). The
 * client uses them to pick UI copy without regexing on free-form
 * messages.
 *
 * Reason taxonomy: narrower than stage. A `db_insert` stage can have
 * reason `fk_violation` or `unique_violation`. Optional — many stages
 * have a single canonical reason.
 *
 * Correlation id: a per-request UUID emitted by the server in the
 * `X-Request-Id` response header (and echoed back into the error
 * payload for clients that don't read headers). Clients display it
 * in toast footers so support tickets carry a primary key.
 */

export type OperationError = {
  /** Server-side processing stage that produced the error. */
  stage: string
  /** Narrower category within `stage` (optional). */
  reason?: string
  /** Stable code for telemetry grouping (e.g. `IMAGE_STATE_LOAD_FAILED`). */
  code?: string
  /** UUID echoed from the `X-Request-Id` response header. */
  correlationId?: string
  /** Raw server message — fallback for UI when no STAGE_COPY entry. */
  message: string
}

/**
 * Type-guard for `OperationError`-shaped values. Useful in normaliser
 * code that accepts `unknown` (e.g. catch-block parameters).
 */
export function isOperationError(value: unknown): value is OperationError {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return typeof v.stage === "string" && typeof v.message === "string"
}

/**
 * Map a Postgres error code to a canonical `reason` token. Used by
 * server-side RPC wrappers so DB codes (`23503`, `23514`) never leak
 * to the client as raw numbers (S-D2 from the review).
 *
 * Returns `undefined` for codes we haven't mapped; callers should
 * default to leaving `reason` empty and letting `stage` carry the
 * routing information.
 */
export function mapPgErrorCodeToReason(code: string | undefined | null): string | undefined {
  if (!code) return undefined
  switch (code) {
    case "23503": return "fk_violation"
    case "23505": return "unique_violation"
    case "23514": return "check_violation"
    case "23502": return "not_null_violation"
    case "55P03": return "lock_timeout"
    case "40001": return "serialization_failure"
    case "P0001": return "raise_exception"
    case "42501": return "rls_denied"
    default: return undefined
  }
}

/**
 * Convert a thrown PostgrestError-shaped value (or unknown error)
 * into an `OperationError`. Server-side code uses this in route
 * handlers so the wire payload is canonical.
 */
export function pgErrorToOperationError(
  err: unknown,
  stage: string,
  fallbackMessage = "Database error",
): OperationError {
  if (!err || typeof err !== "object") {
    return { stage, message: fallbackMessage }
  }
  const e = err as { message?: unknown; code?: unknown }
  const message = typeof e.message === "string" ? e.message : fallbackMessage
  const code = typeof e.code === "string" ? e.code : undefined
  return {
    stage,
    reason: mapPgErrorCodeToReason(code),
    code,
    message,
  }
}
