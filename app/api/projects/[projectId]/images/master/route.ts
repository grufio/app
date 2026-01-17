import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { requireProjectAccess, requireUser } from "@/lib/api/route-guards"

type Body = {
  storage_path: string
  name: string
  format: string
  width_px: number
  height_px: number
  file_size_bytes: number
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const supabase = await createSupabaseServerClient()

  const u = await requireUser(supabase)
  if (!u.ok) return u.res
  const a = await requireProjectAccess(supabase, projectId)
  if (!a.ok) return a.res

  const { data: img, error: imgErr } = await supabase
    .from("project_images")
    .select("storage_path,name,format,width_px,height_px,file_size_bytes")
    .eq("project_id", projectId)
    .eq("role", "master")
    .maybeSingle()

  if (imgErr) {
    return NextResponse.json({ error: imgErr.message, stage: "image_query" }, { status: 400 })
  }

  if (!img?.storage_path) {
    return NextResponse.json({ exists: false })
  }

  const { data: signed, error: signedErr } = await supabase.storage
    .from("project_images")
    .createSignedUrl(img.storage_path, 60 * 10) // 10 minutes

  if (signedErr || !signed?.signedUrl) {
    return NextResponse.json(
      { error: signedErr?.message ?? "Failed to create signed URL", stage: "signed_url" },
      { status: 400 }
    )
  }

  return NextResponse.json({
    exists: true,
    signedUrl: signed.signedUrl,
    storage_path: img.storage_path,
    name: img.name,
    format: img.format,
    width_px: img.width_px,
    height_px: img.height_px,
    file_size_bytes: img.file_size_bytes,
  })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const supabase = await createSupabaseServerClient()

  const u = await requireUser(supabase)
  if (!u.ok) return u.res

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: "Invalid JSON", stage: "body" }, { status: 400 })
  }

  if (
    !body?.storage_path ||
    !body?.name ||
    !body?.format ||
    !Number.isFinite(body.width_px) ||
    !Number.isFinite(body.height_px) ||
    !Number.isFinite(body.file_size_bytes)
  ) {
    return NextResponse.json({ error: "Missing/invalid fields", stage: "validate" }, { status: 400 })
  }

  const a = await requireProjectAccess(supabase, projectId)
  if (!a.ok) return a.res

  // Upsert master image row; RLS enforces owner-only via projects.owner_id = auth.uid().
  const { error } = await supabase
    .from("project_images")
    .upsert(
      {
        project_id: projectId,
        role: "master",
        name: body.name,
        format: body.format,
        width_px: body.width_px,
        height_px: body.height_px,
        storage_path: body.storage_path,
        file_size_bytes: body.file_size_bytes,
      },
      { onConflict: "project_id,role" }
    )

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        stage: "upsert",
        code: (error as unknown as { code?: string })?.code,
        hint: (error as unknown as { hint?: string })?.hint,
        details: {
          project_id: projectId,
          user_id: user.id,
        },
      },
      { status: 400 }
    )
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const supabase = await createSupabaseServerClient()

  const u = await requireUser(supabase)
  if (!u.ok) return u.res
  const a = await requireProjectAccess(supabase, projectId)
  if (!a.ok) return a.res

  const { data: img, error: imgErr } = await supabase
    .from("project_images")
    .select("storage_path")
    .eq("project_id", projectId)
    .eq("role", "master")
    .maybeSingle()

  if (imgErr) {
    return NextResponse.json({ error: imgErr.message, stage: "image_query" }, { status: 400 })
  }

  if (!img?.storage_path) {
    return NextResponse.json({ ok: true, deleted: false })
  }

  const { error: rmErr } = await supabase.storage.from("project_images").remove([img.storage_path])
  if (rmErr) {
    return NextResponse.json(
      { error: rmErr.message, stage: "storage_remove", storage_path: img.storage_path },
      { status: 400 }
    )
  }

  const { error: delErr } = await supabase
    .from("project_images")
    .delete()
    .eq("project_id", projectId)
    .eq("role", "master")

  if (delErr) {
    return NextResponse.json({ error: delErr.message, stage: "db_delete" }, { status: 400 })
  }

  return NextResponse.json({ ok: true, deleted: true })
}
