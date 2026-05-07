/**
 * Integration test: set_active_master_with_state under concurrency.
 *
 * The RPC takes `pg_advisory_xact_lock(hashtext(project_id::text))`
 * before mutating `project_images.is_active` + upserting into
 * `project_image_state`. Two concurrent calls on the same project must
 * serialize, not interleave — otherwise we could end up with two rows
 * marked `is_active = true` or with mixed-state geometry.
 *
 * We fire two RPC calls in parallel and verify exactly one image is
 * active and its state row matches one of the two requested geometries
 * (whichever won the lock — both are valid outcomes).
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import {
  cleanupProject,
  getServiceClient,
  seedImage,
  seedProject,
} from "./_setup"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"

describe("set_active_master_with_state() lock", () => {
  let supabase: SupabaseClient<Database>

  beforeAll(() => {
    supabase = getServiceClient()
  })

  let projectId: string | null = null
  let ownerId: string | null = null

  afterEach(async () => {
    if (projectId && ownerId) {
      await cleanupProject({ supabase, projectId, ownerId })
    }
    projectId = null
    ownerId = null
  })

  it("serializes two parallel calls on the same project", async () => {
    const seeded = await seedProject({ supabase })
    projectId = seeded.projectId
    ownerId = seeded.ownerId

    const masterA = await seedImage({ supabase, projectId, kind: "master", name: "A" })
    const masterB = await seedImage({ supabase, projectId, kind: "master", name: "B" })

    const callA = supabase.rpc("set_active_master_with_state", {
      p_project_id: projectId,
      p_image_id: masterA.imageId,
      p_x_px_u: "0",
      p_y_px_u: "0",
      p_width_px_u: "100000000",
      p_height_px_u: "100000000",
    })
    const callB = supabase.rpc("set_active_master_with_state", {
      p_project_id: projectId,
      p_image_id: masterB.imageId,
      p_x_px_u: "1000000",
      p_y_px_u: "1000000",
      p_width_px_u: "200000000",
      p_height_px_u: "200000000",
    })

    const [resA, resB] = await Promise.all([callA, callB])
    expect(resA.error).toBeNull()
    expect(resB.error).toBeNull()

    const { data: actives } = await supabase
      .from("project_images")
      .select("id, is_active")
      .eq("project_id", projectId)
      .eq("is_active", true)
    expect(actives).toHaveLength(1)
    const winner = actives![0]!.id
    expect([masterA.imageId, masterB.imageId]).toContain(winner)

    // Both calls inserted their own state row (PK is project_id+image_id),
    // but the winner — the call that ran second under the advisory lock —
    // is the one with is_active=true. Verify its state row matches what
    // it asked for, proving the upsert ran inside the same critical
    // section as the is_active flip.
    const { data: winnerState } = await supabase
      .from("project_image_state")
      .select("image_id, role, width_px_u, height_px_u")
      .eq("project_id", projectId)
      .eq("image_id", winner)
      .single()
    expect(winnerState?.role).toBe("master")
    if (winner === masterA.imageId) {
      expect(winnerState?.width_px_u).toBe("100000000")
      expect(winnerState?.height_px_u).toBe("100000000")
    } else {
      expect(winnerState?.width_px_u).toBe("200000000")
      expect(winnerState?.height_px_u).toBe("200000000")
    }
  })

  it("rejects non-positive geometry", async () => {
    const seeded = await seedProject({ supabase })
    projectId = seeded.projectId
    ownerId = seeded.ownerId

    const master = await seedImage({ supabase, projectId, kind: "master" })
    const { error } = await supabase.rpc("set_active_master_with_state", {
      p_project_id: projectId,
      p_image_id: master.imageId,
      p_x_px_u: "0",
      p_y_px_u: "0",
      p_width_px_u: "0",
      p_height_px_u: "100000000",
    })
    expect(error).not.toBeNull()
    expect(String(error?.message ?? "")).toMatch(/positive/i)
  })
})
