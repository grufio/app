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

export function isAllowedAppPath(pathname: string): boolean {
  return ALLOWED_APP_PATH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  )
}

export function safeAppRedirectUrl(opts: { origin: string; pathname: string }): string {
  const origin = String(opts.origin || "")
  const pathname = String(opts.pathname || "")

  // Path must be absolute and not protocol-relative.
  const isAbsolutePath = pathname.startsWith("/") && !pathname.startsWith("//")
  const safePath = isAbsolutePath && isAllowedAppPath(pathname) ? pathname : "/dashboard"

  return new URL(safePath, origin).toString()
}

export function safeOAuthCallbackRedirectTo(origin: string): string {
  return new URL("/auth/callback", origin).toString()
}

