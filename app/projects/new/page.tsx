/**
 * Legacy new-project route.
 *
 * Responsibilities:
 * - Keep backward-compatible route behavior without owning create logic.
 * - Redirect to dashboard where the canonical API-based create flow lives.
 */
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function NewProjectPage() {
  redirect("/dashboard")
}

