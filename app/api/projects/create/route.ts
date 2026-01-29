/**
 * API route: create a new project.
 *
 * Responsibilities:
 * - Validate request body and auth.
 * - Insert `projects` and initial `project_workspace` rows.
 */
import { NextResponse } from "next/server"

import { jsonError, readJson, requireUser } from "@/lib/api/route-guards"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createProjectWithWorkspace } from "@/services/projects"
import type { Unit } from "@/lib/editor/units"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient()
  const u = await requireUser(supabase)
  if (!u.ok) return u.res

  const parsed = await readJson(req, { stage: "body" })
  if (!parsed.ok) return parsed.res
  const body = parsed.value as unknown

  const b = body as Partial<{
    name: string
    unit: Unit
    width_value: number
    height_value: number
    dpi: number
  }>

  const res = await createProjectWithWorkspace(supabase, {
    ownerId: u.user.id,
    name: typeof b.name === "string" ? b.name : "Untitled",
    unit: b.unit as Unit,
    width_value: Number(b.width_value),
    height_value: Number(b.height_value),
    dpi: Number(b.dpi),
  })
  if (!res.ok) return jsonError(res.message, 400, { stage: res.stage })

  return NextResponse.json({ id: res.projectId })
}

