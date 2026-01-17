import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"

type Payload = {
  role: "master" | "working"
  x: number
  y: number
  scale_x: number
  scale_y: number
  width_px?: number
  height_px?: number
  unit?: "mm" | "cm" | "pt" | "px"
  dpi?: number
  rotation_deg: number
}

function isMissingColumnError(err: unknown, col: string): boolean {
  const msg = typeof (err as { message?: unknown })?.message === "string" ? String((err as { message?: string }).message) : ""
  // PostgREST schema cache errors look like:
  // "Could not find the 'dpi' column of 'project_image_state' in the schema cache"
  return msg.includes(`Could not find the '${col}' column`) && msg.includes("schema cache")
}

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Try new schema first (unit + dpi).
  const { data: dataV2, error: errV2 } = await supabase
    .from("project_image_state")
    .select("project_id,role,x,y,scale_x,scale_y,width_px,height_px,unit,dpi,rotation_deg")
    .eq("project_id", projectId)
    .eq("role", "master")
    .maybeSingle()

  if (errV2) {
    // Backward compatibility: DB migration not applied yet.
    if (isMissingColumnError(errV2, "dpi") || isMissingColumnError(errV2, "unit")) {
      const { data: dataV1, error: errV1 } = await supabase
        .from("project_image_state")
        .select("project_id,role,x,y,scale_x,scale_y,width_px,height_px,rotation_deg")
        .eq("project_id", projectId)
        .eq("role", "master")
        .maybeSingle()
      if (errV1) return NextResponse.json({ error: errV1.message }, { status: 400 })
      return NextResponse.json({ exists: Boolean(dataV1), state: dataV1 ?? null })
    }

    return NextResponse.json({ error: errV2.message }, { status: 400 })
  }

  return NextResponse.json({ exists: Boolean(dataV2), state: dataV2 ?? null })
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
  const width_px = body.width_px == null ? null : Number(body.width_px)
  const height_px = body.height_px == null ? null : Number(body.height_px)
  const unit = body.unit === "mm" || body.unit === "cm" || body.unit === "pt" || body.unit === "px" ? body.unit : null
  const dpi = body.dpi == null ? null : Number(body.dpi)
  const rotation_deg = Number(body.rotation_deg)

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(scale_x) ||
    !Number.isFinite(scale_y) ||
    scale_x <= 0 ||
    scale_y <= 0 ||
    !Number.isFinite(rotation_deg) ||
    (width_px != null && (!Number.isFinite(width_px) || width_px <= 0)) ||
    (height_px != null && (!Number.isFinite(height_px) || height_px <= 0)) ||
    (dpi != null && (!Number.isFinite(dpi) || dpi <= 0))
  ) {
    return NextResponse.json({ error: "Invalid fields" }, { status: 400 })
  }

  // Try new schema first (unit + dpi), then fall back if the migration isn't applied yet.
  const baseRow = {
    project_id: projectId,
    role,
    x,
    y,
    scale_x,
    scale_y,
    width_px,
    height_px,
    rotation_deg,
  }

  const { error: errV2 } = await supabase.from("project_image_state").upsert(
    {
      ...baseRow,
      unit,
      dpi,
    },
    { onConflict: "project_id,role" }
  )

  if (errV2) {
    if (isMissingColumnError(errV2, "dpi") || isMissingColumnError(errV2, "unit")) {
      const { error: errV1 } = await supabase.from("project_image_state").upsert(baseRow, {
        onConflict: "project_id,role",
      })
      if (errV1) return NextResponse.json({ error: errV1.message }, { status: 400 })
      return NextResponse.json({ ok: true, warning: "Image meta persistence (unit/dpi) disabled until DB migration is applied." })
    }
    return NextResponse.json({ error: errV2.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}

