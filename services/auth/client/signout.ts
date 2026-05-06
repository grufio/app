/**
 * Auth service (client): sign-out helper.
 *
 * Responsibilities:
 * - Clear the Supabase session on the client.
 * - Send the user back to /login (the proxy already redirects unauthenticated
 *   visits there, but doing it explicitly here avoids a flash of stale UI).
 */
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

/**
 * Clears the Supabase session and navigates the browser to `redirectTo`
 * (default `/login`). Server-rendered routes that require auth would
 * already redirect unauthenticated traffic to /login; doing it explicitly
 * here avoids a flash of stale UI between signOut and the next page.
 */
export async function signOutClient(opts: { redirectTo?: string } = {}): Promise<void> {
  const supabase = createSupabaseBrowserClient()
  await supabase.auth.signOut()
  if (typeof window !== "undefined") {
    window.location.assign(opts.redirectTo ?? "/login")
  }
}
