/**
 * Root route entry.
 *
 * Responsibilities:
 * - Redirect users to the login flow (app is auth-gated).
 */
import { redirect } from "next/navigation"

export default function Home() {
  redirect("/login")
}
