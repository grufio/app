/**
 * Supabase server-only helper: create an RLS-enforced client for a specific user.
 *
 * Responsibilities:
 * - Construct a Supabase client that sends an explicit `Authorization: Bearer <accessToken>` header.
 * - Use ONLY public (anon) credentials + user access token (never service_role).
 *
 * Notes:
 * - Intended for Route Handlers that must call Storage APIs under Storage RLS.
 * - Prefer `createSupabaseServerClient()` for typical SSR flows; use this helper only when you
 *   need to guarantee the Authorization header is present for downstream calls.
 */
import { createClient } from "@supabase/supabase-js"
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"

export function createSupabaseAuthedUserClient(accessToken: string): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY")
  }
  if (!accessToken || typeof accessToken !== "string") {
    throw new Error("Missing access token")
  }

  return createClient<Database>(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    accessToken: async () => accessToken,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

