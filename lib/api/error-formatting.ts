/**
 * Canonical formatter for client-side API errors thrown from the
 * `lib/api/*` wrappers (`project-images`, `project-trace`, …).
 *
 * Builds the message that `error-normalizer.ts` parses back into the
 * structured `OperationError` shape. The format below and the
 * `HTTP_PATTERN` / `STAGE_PATTERN` regexes in `error-normalizer.ts`
 * are paired — if you change the layout, update the regexes in the
 * same PR or `normalizeApiError` stops extracting stage and stripping
 * the parenthetical metadata for legacy (non-ApiError) throws.
 */
export type ApiErrorPayload = Record<string, unknown> | null

export function formatApiError(
  prefix: string,
  status: number,
  payload: ApiErrorPayload,
): string {
  const stage =
    typeof payload?.stage === "string" && payload.stage.trim()
      ? payload.stage
      : `http_${status}`
  const error =
    typeof payload?.error === "string" && payload.error.trim()
      ? payload.error
      : payload
        ? JSON.stringify(payload)
        : "No JSON error body returned"
  const code =
    typeof payload?.code === "string" && payload.code.trim()
      ? ` code=${payload.code}`
      : ""
  return `${prefix} (HTTP ${status}, stage=${stage}${code}): ${error}`
}
