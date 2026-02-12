/**
 * Server-side schema mismatch detection helpers.
 *
 * Responsibilities:
 * - Detect common PostgREST schema cache / missing DDL error messages.
 * - Produce actionable error messages for route error boundaries.
 */
export function isSchemaMismatchMessage(message: string): boolean {
  return /does not exist|schema cache|PGRST/i.test(message) && /column|relation|schema/i.test(message)
}

export function schemaMismatchError(stage: string, message: string): Error {
  return new Error(
    [
      `Schema mismatch (${stage}).`,
      message,
      "Fix: apply migrations (preferred: `supabase db push --linked`), then regenerate types (`npm run types:gen`).",
    ].join(" ")
  )
}

