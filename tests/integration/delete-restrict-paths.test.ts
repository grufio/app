/**
 * Integration test — H1 precondition proof.
 *
 * Before flipping prod `project_images.source_image_id` from CASCADE (current
 * drift) → RESTRICT (the migration + `delete_master_with_cascade`'s intended
 * semantic), we must prove the two delete paths that are NOT ordered bottom-up
 * survive under RESTRICT (i.e. do not abort with SQLSTATE 23503). The local DB
 * is already RESTRICT, so these tests run against the target world.
 *
 *   A) `delete_project` — relies on the `projects → project_images` CASCADE
 *      fan-out (not ordered deletion). Stress it with the full
 *      master → filter_output → trace_base → trace_output topology + a trace row.
 *   B) deleting a filter's output image while a trace sits on it — the final
 *      step of `removeProjectImageFilter` (`services/editor/server/filter-variants.ts`)
 *      hard-deletes `output_image_id`; a `trace_base.source_image_id → output`
 *      (RESTRICT) would block it.
 *
 * Result / why the flip is safe:
 *   A passes → `delete_project` is RESTRICT-safe even for the deep topology.
 *   B passes → RESTRICT blocks the filter-output delete (23503) — but that state
 *   is UI-unreachable: `deriveSectionLocks` sets `filterLocked = hasTrace`
 *   (`lib/editor/section-locks.ts`), so filter removal is disabled while a trace
 *   exists. Even via a direct API call, RESTRICT's loud 23503 is strictly SAFER
 *   than prod's current CASCADE, which would silently delete the trace's base.
 *   → No code fix to `removeProjectImageFilter` is required before the flip.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { cleanupProject, getServiceClient, seedImage, seedProject, seedTrace } from "./_setup"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"

describe("H1 RESTRICT delete-path proof", () => {
  let supabase: SupabaseClient<Database>
  beforeAll(() => {
    supabase = getServiceClient()
  })

  let projectId: string | null = null
  let ownerId: string | null = null
  afterEach(async () => {
    if (projectId && ownerId) await cleanupProject({ supabase, projectId, ownerId })
    projectId = null
    ownerId = null
  })

  // master ← filter_output ← trace_base ← trace_output, + the trace row
  // (output → trace_output CASCADE, base → trace_base RESTRICT).
  async function seedDeepTopology() {
    const seeded = await seedProject({ supabase })
    projectId = seeded.projectId
    ownerId = seeded.ownerId
    const master = await seedImage({ supabase, projectId, kind: "master" })
    const fo = await seedImage({ supabase, projectId, kind: "filter_working_copy", sourceImageId: master.imageId })
    const { error: filterErr } = await supabase.from("project_image_filters").insert({
      project_id: projectId,
      input_image_id: master.imageId,
      output_image_id: fo.imageId,
      filter_type: "bw_hard",
    })
    expect(filterErr).toBeNull()
    const tb = await seedImage({ supabase, projectId, kind: "trace_base", sourceImageId: fo.imageId })
    const to = await seedImage({ supabase, projectId, kind: "trace_output", sourceImageId: tb.imageId })
    await seedTrace({ supabase, projectId, outputImageId: to.imageId, baseImageId: tb.imageId })
    return { master, fo, tb, to }
  }

  it("A) delete_project survives the deep filter+trace topology under RESTRICT", async () => {
    await seedDeepTopology()
    const { error } = await supabase.rpc("delete_project", { p_project_id: projectId! })
    expect(error).toBeNull() // if this is 23503, delete_project is NOT RESTRICT-safe
    const { count } = await supabase
      .from("project_images")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId!)
    expect(count).toBe(0)
    projectId = null // already deleted
  })

  it("B) deleting a filter output that has a trace on it is blocked by RESTRICT (23503)", async () => {
    const { fo } = await seedDeepTopology()
    // The final step of removeProjectImageFilter hard-deletes the filter output.
    const { error } = await supabase.from("project_images").delete().eq("id", fo.imageId)
    // trace_base.source_image_id → fo (RESTRICT) blocks it. Documents that
    // removeProjectImageFilter must tear the trace down first before the flip.
    expect(error).not.toBeNull()
    expect((error as { code?: string })?.code).toBe("23503")
  })
})
