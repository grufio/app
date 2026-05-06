/**
 * Supabase browser client factory.
 *
 * Responsibilities:
 * - Construct an SSR-compatible Supabase client for use in the browser.
 * - Validate required public env vars are present.
 *
 * Why `getRequiredPublicEnv` and not `getRequiredEnv`: this module is
 * bundled into the browser. Next.js only inlines `process.env.NEXT_PUBLIC_*`
 * for *literal* accesses; the dynamic `process.env[name]` inside
 * `getRequiredEnv` ships as `undefined` to the browser, which broke logout
 * (signOutClient → createSupabaseBrowserClient → throw). The public helper
 * has a literal-access switch the bundler can inline.
 */
import { createBrowserClient } from "@supabase/ssr"

import { getRequiredPublicEnv } from "@/lib/env"
import type { Database } from "@/lib/supabase/database.types"

export function createSupabaseBrowserClient() {
  const url = getRequiredPublicEnv("NEXT_PUBLIC_SUPABASE_URL")
  const anonKey = getRequiredPublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  return createBrowserClient<Database>(url, anonKey)
}

