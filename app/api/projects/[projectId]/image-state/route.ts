import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { isUuid, requireUser } from "@/lib/api/route-guards"
import { validateIncomingImageStateUpsert, type IncomingImageStatePayload } from "@/lib/editor/imageState"

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  if (!isUuid(String(projectId))) {
    return NextResponse.json({ error: "Invalid projectId", stage: "params" }, { status: 400 })
  }
  const supabase = await createSupabaseServerClient()

  const u = await requireUser(supabase)
  if (!u.ok) return u.res

  const { data, error } = await supabase
    .from("project_image_state")
    .select("project_id,role,x_px_u,y_px_u,width_px_u,height_px_u,rotation_deg")
    .eq("project_id", projectId)
    .eq("role", "master")
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  if (data && (!data.width_px_u || !data.height_px_u)) {
    return NextResponse.json({ error: "Unsupported image state: missing width_px_u/height_px_u" }, { status: 400 })
  }

  return NextResponse.json({ exists: Boolean(data), state: data ?? null })
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  if (!isUuid(String(projectId))) {
    return NextResponse.json({ error: "Invalid projectId", stage: "params" }, { status: 400 })
  }
  const supabase = await createSupabaseServerClient()

  const u = await requireUser(supabase)
  if (!u.ok) return u.res

  let body: IncomingImageStatePayload = {}
  try {
    body = (await req.json()) as IncomingImageStatePayload
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const validated = validateIncomingImageStateUpsert(body)
  if (!validated) {
    return NextResponse.json({ error: "Invalid fields" }, { status: 400 })
  }

  // µpx schema required.
  const baseRow = {
    project_id: projectId,
    ...validated,
  }

  const { error: errV2 } = await supabase.from("project_image_state").upsert(baseRow, { onConflict: "project_id,role" })

  if (errV2) {
    return NextResponse.json({ error: errV2.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}

