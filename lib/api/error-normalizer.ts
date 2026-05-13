/**
 * Turns thrown errors (ApiError instances, plain Errors, strings,
 * anything else) into the canonical `OperationError` shape carried
 * through the rest of the editor stack.
 *
 * Two layers:
 *
 * - `normalizeApiError(unknown): OperationError` — the canonicalising
 *   converter. Preferred path is structural extraction from
 *   `ApiError.payload` (where the server has already filled in
 *   `stage` / `error` / `correlationId`). Fallback path is regex
 *   parsing of the formatApiError-style message for legacy errors.
 *
 * - `formatOperationErrorForToast(err): { title, detail?, retriable }`
 *   — UI-facing translator. Looks up the canonical `stage` in the
 *   STAGE_COPY table to produce the toast title + secondary detail.
 *   Unknown stages fall back to the raw server message stripped of
 *   the formatApiError suffix.
 *
 * Why split: server emits `OperationError`-shape errors with
 * `correlationId`. UI rendering needs both the structured form (for
 * dedup, logging, support tickets) and a friendly display form. The
 * split also lets callers that don't render UI (machine actions,
 * telemetry) work with the structured shape without dragging in
 * STAGE_COPY copy.
 */

import { ApiError } from "./api-error"
import { isOperationError, type OperationError } from "./operation-error"

/**
 * Map of known `stage` values to friendly toast copy. Add a new entry
 * here when a stage starts appearing in production with poor default
 * messaging — never try to interpret the stage string at the call
 * site.
 */
const STAGE_COPY: Record<string, { title: string; detail?: string; retriable: boolean }> = {
  chain_invalid: {
    title: "Filter chain is out of sync",
    detail: "Close this dialog and re-open the project to refresh the editor state.",
    retriable: true,
  },
  lock_conflict: {
    title: "Image is locked",
    detail: "Unlock the image before applying this filter.",
    retriable: false,
  },
  upload_limits: {
    title: "Upload exceeds the limit",
    detail: "Files must stay under 50 MB and 100 megapixels.",
    retriable: false,
  },
  storage_upload: {
    title: "Upload failed",
    detail: "The image could not be saved. Please try again.",
    retriable: true,
  },
  service_unavailable: {
    title: "Filter service is temporarily unavailable",
    detail: "The render service is starting up or briefly down. Try again in a moment.",
    retriable: true,
  },
  validation: {
    title: "Invalid request",
    retriable: false,
  },
  rls_denied: {
    title: "Access denied",
    detail: "You don't have permission to perform this action.",
    retriable: false,
  },
  auth: {
    title: "You're signed out",
    detail: "Sign in again and retry.",
    retriable: false,
  },
}

const STAGE_PATTERN = /\bstage=([a-z_]+)/i
const HTTP_PATTERN = /\(HTTP \d+(?:,\s*stage=[a-z_]+)?(?:\s+code=[\w-]+)?\):\s*/i

function stripFormatApiErrorSuffix(message: string): string {
  // formatApiError builds:
  //   "<prefix> (HTTP <status>, stage=<stage> [code=<code>]): <error>"
  // Drop the parenthetical metadata so the user sees just the prefix +
  // the upstream error message.
  return message.replace(HTTP_PATTERN, ": ").replace(/\s+:\s*/, ": ")
}

function readStringProp(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined
  const v = (value as Record<string, unknown>)[key]
  return typeof v === "string" ? v : undefined
}

/**
 * Build an `OperationError` from an `ApiError`-wrapped server
 * response. Reads `payload.stage / .error / .correlationId / .reason`
 * structurally so the canonical shape survives intact end-to-end.
 */
function fromApiError(err: ApiError): OperationError {
  const payload = err.payload ?? {}
  const stage = readStringProp(payload, "stage") ?? "unknown"
  const message = readStringProp(payload, "error") ?? err.message ?? "Request failed"
  const correlationId = readStringProp(payload, "correlationId")
  // The payload's `reason` is sometimes set by route handlers (e.g.
  // `reason: "image_locked"`). Fall back to undefined when absent.
  const reason = readStringProp(payload, "reason")
  return {
    stage,
    reason,
    code: err.code,
    correlationId,
    message,
  }
}

/**
 * Normalises an unknown error into a canonical `OperationError`.
 *
 * Priority order:
 *  1. Already an OperationError → return as-is.
 *  2. An ApiError → structural extraction from payload.
 *  3. A plain Error / string → regex-parse stage from the message
 *     (legacy path; treats anything pre-#PR-6a-server-emit).
 *  4. Anything else → wrap as `{ stage: "unknown", message: "Unknown error" }`.
 */
export function normalizeApiError(error: unknown): OperationError {
  if (isOperationError(error)) return error
  if (error instanceof ApiError) return fromApiError(error)

  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : ""
  if (!raw) return { stage: "unknown", message: "Unknown error" }

  const stageMatch = raw.match(STAGE_PATTERN)
  const stage = stageMatch ? stageMatch[1].toLowerCase() : "unknown"
  const cleaned = stripFormatApiErrorSuffix(raw).trim() || raw
  return { stage, message: cleaned }
}

/**
 * UI-facing translator. Produces the title + secondary detail line
 * for a toast (or inline alert). Known stages get the friendly
 * STAGE_COPY entry; unknown stages fall back to the raw message.
 *
 * `retriable` is informational — used by callers that want to render
 * a retry CTA vs. a "fix and retry" hint.
 */
export function formatOperationErrorForToast(err: OperationError): {
  title: string
  detail?: string
  retriable: boolean
} {
  const copy = STAGE_COPY[err.stage]
  if (copy) return { title: copy.title, detail: copy.detail, retriable: copy.retriable }
  return {
    title: err.message || "Unknown error",
    retriable: false,
  }
}

/**
 * Convenience: convert + render a one-line summary for toasts that
 * don't render a separate description.
 */
export function formatNormalizedApiError(error: unknown): string {
  const op = normalizeApiError(error)
  const t = formatOperationErrorForToast(op)
  return t.detail ? `${t.title} — ${t.detail}` : t.title
}
