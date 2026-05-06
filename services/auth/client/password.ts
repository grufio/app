/**
 * Auth service (client): email + password sign-in.
 */
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

type SignInResult =
  | { ok: true }
  | { ok: false; error: string }

/**
 * Email + password sign-in via Supabase. Resolves to `{ ok: true }` on
 * success or `{ ok: false, error }` with the upstream error message — never
 * throws, so the caller can render the error inline without try/catch.
 */
export async function signInWithPassword(args: { email: string; password: string }): Promise<SignInResult> {
  const supabase = createSupabaseBrowserClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: args.email,
    password: args.password,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
