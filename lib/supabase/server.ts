/**
 * Supabase server client factory (App Router).
 *
 * Responsibilities:
 * - Create a Supabase client bound to Next.js cookies for SSR/auth.
 * - Support cookie reads in Server Components and writes in actions/handlers.
 */
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"

import { getRequiredEnv } from "@/lib/env"
import type { Database } from "@/lib/supabase/database.types"

export async function createSupabaseServerClient() {
  const url = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL")
  const anonKey = getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

  const cookieStore = await cookies()

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Cookies can only be set in Server Actions / Route Handlers.
          // This is safe to ignore in Server Components.
        }
      },
    },
  })
}

