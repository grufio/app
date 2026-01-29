/**
 * Next.js request proxy (middleware replacement for Next 16).
 *
 * Responsibilities:
 * - Enforce auth redirects for protected routes using Supabase SSR client.
 * - Bypass auth in E2E runs where network is mocked.
 */
import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"

const PROTECTED_PREFIXES = ["/dashboard", "/projects"]

// Replacement for `middleware.ts` (deprecated in Next 16): Next will execute this `proxy` on requests.
export async function proxy(request: NextRequest) {
  const { pathname, origin } = request.nextUrl

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // E2E tests run with mocked network calls.
  // - If the header is present, always bypass auth logic.
  // - If `E2E_TEST=1` is set (Playwright dev server), avoid calling Supabase network and simulate auth via header.
  const isE2EHeader = request.headers.get("x-e2e-test") === "1"
  const isE2EEnv = process.env.E2E_TEST === "1"
  if (isE2EHeader) return NextResponse.next()

  if (!url || !anonKey) {
    return NextResponse.next()
  }

  const response = NextResponse.next()

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  const simulatedUser = isE2EEnv ? (request.headers.get("x-e2e-user") === "1" ? ({ id: "e2e-user" } as const) : null) : null
  const {
    data: { user },
  } = simulatedUser ? { data: { user: simulatedUser } } : await supabase.auth.getUser()

  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"))

  // If not authed and trying to access protected routes -> /login
  if (!user && isProtected) {
    const redirectUrl = new URL("/login", origin)
    return NextResponse.redirect(redirectUrl)
  }

  // If authed and visiting /login -> /dashboard
  if (user && pathname === "/login") {
    const redirectUrl = new URL("/dashboard", origin)
    return NextResponse.redirect(redirectUrl)
  }

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
