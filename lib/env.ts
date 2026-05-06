/**
 * Environment-variable accessors with explicit failure modes.
 *
 * Why: Reading process.env directly throws "undefined is not …" deep inside
 * Supabase SDK at first call, which is hard to diagnose. Centralising the
 * read also makes the set of required vars explicit (grep the call sites).
 *
 * Lazy by design: helpers throw at call time, not module import time, so a
 * test suite that imports a server module without the var set still loads.
 *
 * Server vs browser: `getRequiredEnv(name)` performs a *dynamic* lookup
 * (`process.env[name]` with a variable key). That works on the server, but
 * Next.js / Turbopack only inlines `NEXT_PUBLIC_*` into the browser bundle
 * for *literal* accesses (`process.env.NEXT_PUBLIC_FOO`). Browser code that
 * needs a public var must call `getRequiredPublicEnv(name)`, whose `switch`
 * maps each known key to its literal access — which the bundler can inline.
 */

/**
 * Reads `name` from `process.env` and throws an actionable error when
 * missing/empty.
 *
 * Server-only for `NEXT_PUBLIC_*` keys: dynamic lookups don't inline in
 * the browser bundle. Browser callers must use {@link getRequiredPublicEnv}.
 */
export function getRequiredEnv(name: string): string {
  const value = process.env[name]
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `Missing required environment variable: ${name}. Set it in .env.local (dev), Vercel project settings (preview/production), or the corresponding deploy target.`
    )
  }
  return value
}

/** Enumerated set of public env vars readable from browser bundles. */
export type PublicEnvName = "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY"

/**
 * Browser-safe public env reader. Each key is read via a literal
 * `process.env.NEXT_PUBLIC_*` access so Next.js can inline it into the
 * client bundle. Adding a new public var requires extending the switch
 * (and the `PublicEnvName` union) — by design.
 */
export function getRequiredPublicEnv(name: PublicEnvName): string {
  let value: string | undefined
  switch (name) {
    case "NEXT_PUBLIC_SUPABASE_URL":
      value = process.env.NEXT_PUBLIC_SUPABASE_URL
      break
    case "NEXT_PUBLIC_SUPABASE_ANON_KEY":
      value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      break
  }
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
