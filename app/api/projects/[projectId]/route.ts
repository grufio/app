/**
 * API route: project resource operations.
 *
 * Responsibilities:
 * - Handle project deletion (owner-only via auth/RLS).
 */
import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { isUuid } from "@/lib/api/route-guards"

export async function DELETE(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { projectId } = await params
  if (!isUuid(String(projectId))) return NextResponse.json({ error: "Invalid projectId", stage: "params" }, { status: 400 })

  const { data, error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .select("id")
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data?.id) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({ ok: true })
}

