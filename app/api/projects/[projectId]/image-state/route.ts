import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"

type Payload = {
  role: "master" | "working"
  x: number
  y: number
  scale_x: number
  scale_y: number
  rotation_deg: number
}

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("project_image_state")
    .select("project_id,role,x,y,scale_x,scale_y,rotation_deg")
    .eq("project_id", projectId)
    .eq("role", "master")
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ exists: Boolean(data), state: data ?? null })
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: Partial<Payload> = {}
  try {
    body = (await req.json()) as Partial<Payload>
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const role = body.role === "working" ? "working" : "master"
  const x = Number(body.x)
  const y = Number(body.y)
  const scale_x = Number(body.scale_x)
  const scale_y = Number(body.scale_y)
  const rotation_deg = Number(body.rotation_deg)

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(scale_x) ||
    !Number.isFinite(scale_y) ||
    scale_x <= 0 ||
    scale_y <= 0 ||
    !Number.isFinite(rotation_deg)
  ) {
    return NextResponse.json({ error: "Invalid fields" }, { status: 400 })
  }

  const { error } = await supabase.from("project_image_state").upsert(
    {
      project_id: projectId,
      role,
      x,
      y,
      scale_x,
      scale_y,
      rotation_deg,
    },
    { onConflict: "project_id,role" }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

