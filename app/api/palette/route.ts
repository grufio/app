/**
 * API route: read the trace Munsell palettes.
 *
 * Returns both palettes (`color` = active tier of lab_munsell + the 48
 * lab_grays chips appended; `bw` = lab_grays) so the client live-preview snaps
 * cells to the same chips — in the same array order — as the server. Auth-gated;
 * the heavy lifting is the shared `readTracePalette` accessor. The client
 * caches the response.
 */
import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { jsonError, requireUser } from "@/lib/api/route-guards"
import { readTracePalette } from "@/lib/supabase/palette"

export const dynamic = "force-dynamic"

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const u = await requireUser(supabase)
  if (!u.ok) return u.res

  try {
    const [color, bw] = await Promise.all([
      readTracePalette(supabase, "color"),
      readTracePalette(supabase, "bw"),
    ])
    return NextResponse.json({ ok: true, color, bw })
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to read palette", 500, {
      stage: "palette_read",
    })
  }
}
