/**
 * Auth service (client): sign-out helper.
 *
 * Responsibilities:
 * - Clear the Supabase session on the client.
 * - Send the user back to /login (the proxy already redirects unauthenticated
 *   visits there, but doing it explicitly here avoids a flash of stale UI).
 */
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

export async function signOutClient(opts: { redirectTo?: string } = {}): Promise<void> {
  const supabase = createSupabaseBrowserClient()
  await supabase.auth.signOut()
  if (typeof window !== "undefined") {
    window.location.assign(opts.redirectTo ?? "/login")
  }
}
