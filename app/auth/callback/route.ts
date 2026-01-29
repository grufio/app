/**
 * Auth callback route for Supabase OAuth.
 *
 * Responsibilities:
 * - Exchange the OAuth `code` for a Supabase session and redirect to dashboard.
 */
import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")

  if (code) {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error("auth.callback.exchangeCodeForSession failed:", {
        message: error.message,
        status: (error as unknown as { status?: unknown })?.status,
        name: (error as unknown as { name?: unknown })?.name,
      })
      return NextResponse.redirect(`${origin}/login?error=oauth_exchange_failed`)
    }
  } else {
    // Missing code can happen if user navigates here manually; fall through to dashboard redirect.
    console.warn("auth.callback: missing code param")
  }

  return NextResponse.redirect(`${origin}/dashboard`)
}

