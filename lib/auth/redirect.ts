/**
 * Auth redirect safety helpers.
 *
 * Responsibilities:
 * - Prevent open redirects by validating redirect targets.
 * - Keep redirect policy centralized and explicit.
 *
 * Policy (MVP):
 * - Only allow same-origin redirects.
 * - Only allow a small allowlist of in-app target paths.
 */

const ALLOWED_APP_PATH_PREFIXES = ["/dashboard", "/projects"]

/** Returns true when `pathname` is one of the allow-listed in-app routes. */
export function isAllowedAppPath(pathname: string): boolean {
  return ALLOWED_APP_PATH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  )
}

/**
 * Builds an absolute redirect URL on `origin`, falling back to `/dashboard`
 * for any target that isn't an allow-listed in-app path. Prevents open
 * redirects (cross-origin / protocol-relative / unlisted-path).
 */
export function safeAppRedirectUrl(opts: { origin: string; pathname: string }): string {
  const origin = String(opts.origin || "")
  const pathname = String(opts.pathname || "")

  // Path must be absolute and not protocol-relative.
  const isAbsolutePath = pathname.startsWith("/") && !pathname.startsWith("//")
  const safePath = isAbsolutePath && isAllowedAppPath(pathname) ? pathname : "/dashboard"

  return new URL(safePath, origin).toString()
}

/** Builds the canonical OAuth callback URL on `origin` (`/auth/callback`). */
export function safeOAuthCallbackRedirectTo(origin: string): string {
  return new URL("/auth/callback", origin).toString()
}

