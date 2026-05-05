/**
 * Auth service (client): email + password sign-in.
 */
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

type SignInResult =
  | { ok: true }
  | { ok: false; error: string }

export async function signInWithPassword(args: { email: string; password: string }): Promise<SignInResult> {
  const supabase = createSupabaseBrowserClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: args.email,
    password: args.password,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
