/**
 * Auth service (client): OAuth sign-in helpers.
 *
 * Responsibilities:
 * - Initiate OAuth sign-in via Supabase from a service function (not from React components).
 * - Preserve existing auth flow parameters (provider + redirectTo).
 */
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { safeOAuthCallbackRedirectTo } from "@/lib/auth/redirect"

export async function signInWithGoogleOAuth(opts: { redirectTo: string }): Promise<void> {
  const supabase = createSupabaseBrowserClient()
  const redirectTo = (() => {
    try {
      // MVP policy: only allow same-origin redirect to our fixed callback path.
      const url = new URL(opts.redirectTo)
      if (typeof window !== "undefined" && url.origin === window.location.origin && url.pathname === "/auth/callback") {
        return url.toString()
      }
    } catch {
      // fall through
    }
    return typeof window !== "undefined" ? safeOAuthCallbackRedirectTo(window.location.origin) : opts.redirectTo
  })()
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  })
}

