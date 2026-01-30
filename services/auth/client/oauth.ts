/**
 * Auth service (client): OAuth sign-in helpers.
 *
 * Responsibilities:
 * - Initiate OAuth sign-in via Supabase from a service function (not from React components).
 * - Preserve existing auth flow parameters (provider + redirectTo).
 */
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

export async function signInWithGoogleOAuth(opts: { redirectTo: string }): Promise<void> {
  const supabase = createSupabaseBrowserClient()
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: opts.redirectTo },
  })
}

