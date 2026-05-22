/**
 * Integration test: delete_master_with_cascade() cascade.
 *
 * Verifies that calling the RPC removes:
 *   - the project's master row
 *   - all derivative project_images (working_copy, filter_working_copy,
 *     trace_output) via FK ON DELETE CASCADE on source_image_id
 *   - all project_image_filters rows for the project (otherwise FK
 *     RESTRICT on output_image_id would block the image delete — the
 *     bug this RPC fixes)
 *   - the project_image_state row (FK CASCADE on image_id)
 *   - the project_image_trace row (FK CASCADE on output_image_id)
 *
 * Also verifies:
 *   - the project row itself survives (unlike delete_project, this RPC
 *     leaves the project shell intact so the user can upload again)
 *   - the returned storage paths cover every image row that was
 *     deleted (so the API can clean up bucket objects)
 *   - idempotency: a second call on the now-empty project returns
 *     empty without raising
 *   - guard isolation: a master in a sibling project is NOT affected
 *
 * The `app.deleting_project` GUC is reused (not duplicated as a
 * `delete_master` flag). If the guard wiring breaks, this test fails
 * with the same error the bug report originally showed.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import {
  cleanupProject,
  getServiceClient,
  seedImage,
  seedProject,
  seedTrace,
} from "./_setup"
import type { Database } from "@/lib/supabase/database.types"

// The new RPC isn't in database.types.ts until prod-push + types:gen.
// Pass a narrow client cast for the call site; runtime is unaffected.
type CascadeRpc = {
  rpc(
    fn: "delete_master_with_cascade",
    args: { p_project_id: string },
  ): Promise<{
    data: Array<{ storage_bucket: string | null; storage_path: string | null }> | null
    error: { message: string } | null
  }>
}

describe("delete_master_with_cascade()", () => {
  let supabase: SupabaseClient<Database>

  beforeAll(() => {
    supabase = getServiceClient()
  })

  // Tracked per test so afterEach sweeps on assertion failure too.
  const seeded: Array<{ projectId: string; ownerId: string }> = []

  afterEach(async () => {
    while (seeded.length > 0) {
      const next = seeded.pop()
      if (!next) continue
      await cleanupProject({ supabase, projectId: next.projectId, ownerId: next.ownerId })
    }
  })

  it("removes master, derivatives, filters, state, and trace in one cascade — project survives", async () => {
    const { projectId, ownerId } = await seedProject({ supabase })
    seeded.push({ projectId, ownerId })

    const master = await seedImage({ supabase, projectId, kind: "master" })
    const workingCopy = await seedImage({
      supabase,
      projectId,
      kind: "working_copy",
      sourceImageId: master.imageId,
    })
    const filterOutput = await seedImage({
      supabase,
      projectId,
      kind: "filter_working_copy",
      sourceImageId: workingCopy.imageId,
    })
    const traceOutput = await seedImage({
      supabase,
      projectId,
      kind: "trace_output",
      sourceImageId: filterOutput.imageId,
    })

    const { error: filterErr } = await supabase
      .from("project_image_filters")
      .insert({
        project_id: projectId,
        input_image_id: workingCopy.imageId,
        output_image_id: filterOutput.imageId,
        filter_type: "bw_hard",
        stack_order: 1,
      })
    expect(filterErr).toBeNull()

    const { error: stateErr } = await supabase
      .from("project_image_state")
      .insert({
        project_id: projectId,
        image_id: master.imageId,
        width_px_u: "100000000",
        height_px_u: "100000000",
        rotation_deg: 0,
      })
    expect(stateErr).toBeNull()

    const { error: traceErr } = await supabase
      .from("project_image_trace")
      .insert({
        project_id: projectId,
        output_image_id: traceOutput.imageId,
        kind: "pixelate",
        params: {},
      })
    expect(traceErr).toBeNull()

    // Call the RPC. Cascade should run, return paths for all 4 images.
    const { data: paths, error: rpcErr } = await (supabase as unknown as CascadeRpc).rpc(
      "delete_master_with_cascade",
      { p_project_id: projectId },
    )
    expect(rpcErr).toBeNull()
    expect(paths).not.toBeNull()
    expect(paths?.length).toBe(4)
    const pathStrings = (paths ?? []).map((r) => r.storage_path).filter(Boolean) as string[]
    expect(pathStrings).toHaveLength(4)

    // Project itself still exists.
    const { count: projectCount } = await supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("id", projectId)
    expect(projectCount).toBe(1)

    // Every image-related child table is empty for this project.
    const { count: imageCount } = await supabase
      .from("project_images")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
    expect(imageCount).toBe(0)

    const { count: filterCount } = await supabase
      .from("project_image_filters")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
    expect(filterCount).toBe(0)

    const { count: stateCount } = await supabase
      .from("project_image_state")
      .select("image_id", { count: "exact", head: true })
      .eq("project_id", projectId)
    expect(stateCount).toBe(0)

    const { count: traceCount } = await supabase
      .from("project_image_trace")
      .select("output_image_id", { count: "exact", head: true })
      .eq("project_id", projectId)
    expect(traceCount).toBe(0)
  })

  // M4: the full trace topology exercises BOTH ON DELETE RESTRICT FKs.
  //   master → working_copy → {filter_working_copy, trace_base, trace_output}
  // with a project_image_trace row whose:
  //   - base_image_id   → trace_base   (project_image_trace_base_image_id_fkey, RESTRICT)
  //   - output_image_id → trace_output (output_image_id FK, CASCADE)
  // The trace_base also has source_image_id → working_copy (RESTRICT).
  // Against the old RPC (no trace_base delete) this aborts with 23503
  // at the working_copy delete (trace_base.source_image_id still
  // points at it). The fix deletes trace_base after trace_output (whose
  // CASCADE drops the trace row, releasing base_image_id RESTRICT) and
  // before working_copy. Contract: 0 trace_base rows + 0 remaining
  // image rows after the cascade. Holds under both RESTRICT and CASCADE
  // source_image_id semantics.
  it("removes trace_base too — both source_image_id and base_image_id RESTRICT paths", async () => {
    const { projectId, ownerId } = await seedProject({ supabase })
    seeded.push({ projectId, ownerId })

    const master = await seedImage({ supabase, projectId, kind: "master" })
    const workingCopy = await seedImage({
      supabase,
      projectId,
      kind: "working_copy",
      sourceImageId: master.imageId,
    })
    const filterOutput = await seedImage({
      supabase,
      projectId,
      kind: "filter_working_copy",
      sourceImageId: workingCopy.imageId,
    })
    // trace_base is sourced from the working_copy (RESTRICT path A).
    const traceBase = await seedImage({
      supabase,
      projectId,
      kind: "trace_base",
      sourceImageId: workingCopy.imageId,
    })
    const traceOutput = await seedImage({
      supabase,
      projectId,
      kind: "trace_output",
      sourceImageId: filterOutput.imageId,
    })

    // Single trace row points at BOTH trace_base (RESTRICT path B) and
    // trace_output (CASCADE).
    await seedTrace({
      supabase,
      projectId,
      outputImageId: traceOutput.imageId,
      baseImageId: traceBase.imageId,
    })

    const { data: paths, error: rpcErr } = await (supabase as unknown as CascadeRpc).rpc(
      "delete_master_with_cascade",
      { p_project_id: projectId },
    )
    expect(rpcErr).toBeNull()
    expect(paths).not.toBeNull()
    // 5 images: master, working_copy, filter_working_copy, trace_base, trace_output.
    expect(paths?.length).toBe(5)
    const pathStrings = (paths ?? []).map((r) => r.storage_path).filter(Boolean) as string[]
    expect(pathStrings).toHaveLength(5)

    // No trace_base row survives the cascade.
    const { count: traceBaseCount } = await supabase
      .from("project_images")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("kind", "trace_base")
    expect(traceBaseCount).toBe(0)

    // No image rows of any kind survive.
    const { count: imageCount } = await supabase
      .from("project_images")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
    expect(imageCount).toBe(0)

    // The trace row went via output_image_id CASCADE.
    const { count: traceCount } = await supabase
      .from("project_image_trace")
      .select("output_image_id", { count: "exact", head: true })
      .eq("project_id", projectId)
    expect(traceCount).toBe(0)

    // Project shell survives, as for the other cascade cases.
    const { count: projectCount } = await supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("id", projectId)
    expect(projectCount).toBe(1)
  })

  it("is idempotent: second call on an empty project returns no rows, no error", async () => {
    const { projectId, ownerId } = await seedProject({ supabase })
    seeded.push({ projectId, ownerId })

    // No master ever uploaded — RPC short-circuits.
    const first = await (supabase as unknown as CascadeRpc).rpc(
      "delete_master_with_cascade",
      { p_project_id: projectId },
    )
    expect(first.error).toBeNull()
    expect(first.data ?? []).toHaveLength(0)

    const second = await (supabase as unknown as CascadeRpc).rpc(
      "delete_master_with_cascade",
      { p_project_id: projectId },
    )
    expect(second.error).toBeNull()
    expect(second.data ?? []).toHaveLength(0)
  })

  it("does not affect masters in other projects (guard scope is per-project)", async () => {
    const a = await seedProject({ supabase })
    seeded.push(a)
    const b = await seedProject({ supabase })
    seeded.push(b)

    const masterA = await seedImage({ supabase, projectId: a.projectId, kind: "master" })
    const masterB = await seedImage({ supabase, projectId: b.projectId, kind: "master" })

    const { error } = await (supabase as unknown as CascadeRpc).rpc(
      "delete_master_with_cascade",
      { p_project_id: a.projectId },
    )
    expect(error).toBeNull()

    // A's master gone.
    const { count: aCount } = await supabase
      .from("project_images")
      .select("id", { count: "exact", head: true })
      .eq("id", masterA.imageId)
    expect(aCount).toBe(0)

    // B's master untouched — the guard's `old.project_id::text =
    // v_in_project_delete` check kept it safe even though both calls
    // could theoretically share a backend connection's GUC scope.
    // (set_config(..., true) is transaction-local, so they can't.)
    const { count: bCount } = await supabase
      .from("project_images")
      .select("id", { count: "exact", head: true })
      .eq("id", masterB.imageId)
    expect(bCount).toBe(1)
  })

  it("works when no filter or trace exists (master + working_copy only)", async () => {
    // The simple case the user said already works through the old
    // endpoint — verifying the new RPC handles it too, so we can
    // safely route all UI delete-clicks here regardless of cascade
    // size.
    const { projectId, ownerId } = await seedProject({ supabase })
    seeded.push({ projectId, ownerId })

    const master = await seedImage({ supabase, projectId, kind: "master" })
    await seedImage({
      supabase,
      projectId,
      kind: "working_copy",
      sourceImageId: master.imageId,
    })

    const { data: paths, error } = await (supabase as unknown as CascadeRpc).rpc(
      "delete_master_with_cascade",
      { p_project_id: projectId },
    )
    expect(error).toBeNull()
    expect(paths?.length).toBe(2)

    const { count: imageCount } = await supabase
      .from("project_images")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
    expect(imageCount).toBe(0)
  })
})
