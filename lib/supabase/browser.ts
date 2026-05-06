/**
 * Supabase browser client factory.
 *
 * Responsibilities:
 * - Construct an SSR-compatible Supabase client for use in the browser.
 * - Validate required public env vars are present.
 */
import { createBrowserClient } from "@supabase/ssr"

import { getRequiredEnv } from "@/lib/env"
import type { Database } from "@/lib/supabase/database.types"

export function createSupabaseBrowserClient() {
  const url = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL")
  const anonKey = getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  return createBrowserClient<Database>(url, anonKey)
}

