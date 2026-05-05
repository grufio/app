import "server-only"

import { createClient } from "@supabase/supabase-js"
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"

/**
 * SUPABASE_SERVICE_ROLE_KEY-Client. Bypasses RLS.
 *
 * Convention: only for storage cleanup after soft-delete (the owner client cannot
 * remove storage objects of soft-deleted images, since RLS hides the row). Do not
 * use this client for table mutations — bypassing RLS means losing the audit trail
 * and the ownership boundary that the rest of the app relies on.
 */
export function createSupabaseServiceRoleClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
