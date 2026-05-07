/**
 * Turns API error strings (built by `formatApiError` in lib/api/project-images.ts
 * and similar) into user-friendly messages for toasts and inline alerts.
 *
 * Why: callers used to do `toast.error(error.message)` directly, which leaked
 * `(HTTP 409, stage=chain_invalid)` into the UI. Each call-site grew its own
 * regex / substring detection. This module is the one place that knows about
 * stage strings — UI code calls `normalizeApiError(err)` and renders the
 * returned `title`/`detail`.
 */

export type NormalizedApiError = {
  /** Short user-facing message — fits in a toast title. */
  title: string
  /** Optional secondary line. */
  detail?: string
  /** The structured stage extracted from the message, if any. */
  stage?: string
  /** True when the underlying issue is transient (network, lock, race). */
  retriable: boolean
}

/**
 * Map of known `stage=` values to friendly copy.
 *
 * If you see a stage in production that should have a friendly message, add
 * it here rather than catching the string at the call site.
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
  // Drop the parenthetical metadata so the user sees just the prefix + the
  // upstream error message.
  return message.replace(HTTP_PATTERN, ": ").replace(/\s+:\s*/, ": ")
}

/**
 * Normalises an unknown error (Error instance, string, anything else) into a
 * `NormalizedApiError`. Recognised `stage=` markers are rewritten into the
 * copy from STAGE_COPY; otherwise the original message is preserved with the
 * `(HTTP N, stage=…)` suffix stripped.
 */
export function normalizeApiError(error: unknown): NormalizedApiError {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : ""
  if (!raw) return { title: "Unknown error", retriable: true }

  const stageMatch = raw.match(STAGE_PATTERN)
  const stage = stageMatch ? stageMatch[1].toLowerCase() : undefined

  if (stage && stage in STAGE_COPY) {
    const copy = STAGE_COPY[stage]
    return { title: copy.title, detail: copy.detail, stage, retriable: copy.retriable }
  }

  // No known stage — clean up the formatApiError suffix and return as-is.
  const cleaned = stripFormatApiErrorSuffix(raw).trim()
  return {
    title: cleaned || raw,
    stage,
    // Default: 4xx is non-retriable, 5xx + network errors are retriable.
    retriable: /HTTP 5\d\d/.test(raw) || !/HTTP \d/.test(raw),
  }
}

/**
 * Convenience: format the normalised error into a single line for toasts that
 * don't render a description separately.
 */
export function formatNormalizedApiError(error: unknown): string {
  const n = normalizeApiError(error)
  return n.detail ? `${n.title} — ${n.detail}` : n.title
}
