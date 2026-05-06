/**
 * Environment-variable accessors with explicit failure modes.
 *
 * Why: Reading process.env directly throws "undefined is not …" deep inside
 * Supabase SDK at first call, which is hard to diagnose. Centralising the
 * read also makes the set of required vars explicit (grep the call sites).
 *
 * Lazy by design: helpers throw at call time, not module import time, so a
 * test suite that imports a server module without the var set still loads.
 */

/** Reads `name` from `process.env` and throws an actionable error when missing/empty. */
export function getRequiredEnv(name: string): string {
  const value = process.env[name]
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `Missing required environment variable: ${name}. Set it in .env.local (dev), Vercel project settings (preview/production), or the corresponding deploy target.`
    )
  }
  return value
}

/** Returns `process.env[name]` or `null` when unset / empty string. */
export function getOptionalEnv(name: string): string | null {
  const value = process.env[name]
  return typeof value === "string" && value.length > 0 ? value : null
}

/** Reads `name` as a positive integer (returns `null` for missing / non-int / ≤ 0). */
export function getOptionalPositiveIntEnv(name: string): number | null {
  const raw = getOptionalEnv(name)
  if (raw == null) return null
  const n = Number(raw)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null
  return n
}
