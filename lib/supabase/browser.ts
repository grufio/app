/**
 * Supabase browser client factory.
 *
 * Responsibilities:
 * - Construct an SSR-compatible Supabase client for use in the browser.
 * - Validate required public env vars are present.
 */
import { createBrowserClient } from "@supabase/ssr"

import type { Database } from "@/lib/supabase/database.types"

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY")
  }

  return createBrowserClient<Database>(url, anonKey)
}

