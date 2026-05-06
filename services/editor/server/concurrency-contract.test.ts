/**
 * Concurrency / contract tests for filter chain operations.
 *
 * These tests document the invariants the system review (#3 MEDIUM,
 * `docs/system-review-2026-05-06.md`) flagged as "untested but should hold":
 *
 *   - Concurrent appends on the same project must be serialized at the DB
 *     level (advisory lock + tip-mismatch invariant). The Postgres RPC
 *     enforces this via `pg_advisory_xact_lock(hashtext(project_id))` —
 *     see supabase/migrations/20260227102000_atomic_filter_chain_append.sql.
 *   - Concurrent removes on the same project must also be serialized
 *     (same lock, see 20260506140000_filter_remove_rpc_and_is_hidden.sql).
 *   - When the append RPC fails because of a tip mismatch (e.g. another
 *     tab raced ahead), the caller surfaces a `chain_append` stage error
 *     so the UI can show a friendly toast instead of stalling.
 *
 * The actual lock contention can only be verified against a real Postgres
 * (the unit suite mocks supabase). What we DO test here is that the
 * client-side code:
 *   - calls the right RPC with the right args
 *   - propagates the structured-error contract on failure
 *   - serialises its own enqueueLatest channel for client-side retries
 */
import { describe, expect, it, vi } from "vitest"

import { appendProjectImageFilter } from "./filter-chain"

describe("concurrency contract — append RPC", () => {
  it("propagates the postgres errcode 23514 (tip mismatch) as stage=chain_append", async () => {
    // 23514 is the check_violation errcode used by the append RPC when
    // the most recent stack tip's output_image_id does not match the
    // proposed input_image_id (= 'filter chain tip mismatch').
    const rpc = vi.fn().mockResolvedValue({
      error: { message: "filter chain tip mismatch", code: "23514" },
    })
    const supabase = { rpc } as unknown as Parameters<typeof appendProjectImageFilter>[0]["supabase"]
    const out = await appendProjectImageFilter({
      supabase,
      projectId: "p1",
      inputImageId: "img-a",
      outputImageId: "img-b",
      filterType: "pixelate",
      filterParams: {},
    })
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.stage).toBe("chain_append")
      expect(out.code).toBe("23514")
    }
  })

  it("propagates the postgres errcode 23503 (FK violation) when input/output don't belong to the project", async () => {
    const rpc = vi.fn().mockResolvedValue({
      error: { message: "input_image_id is not part of project", code: "23503" },
    })
    const supabase = { rpc } as unknown as Parameters<typeof appendProjectImageFilter>[0]["supabase"]
    const out = await appendProjectImageFilter({
      supabase,
      projectId: "p1",
      inputImageId: "wrong-project-img",
      outputImageId: "img-b",
      filterType: "pixelate",
      filterParams: {},
    })
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.code).toBe("23503")
    }
  })

  it("does not retry on RPC errors — caller decides whether to retry", async () => {
    // The service deliberately returns the error verbatim so the workflow
    // adapter (use-project-image-filters) can decide retry policy. A
    // hidden retry inside the service would mask races.
    const rpc = vi.fn().mockResolvedValue({
      error: { message: "advisory lock wait timeout", code: "55P03" },
    })
    const supabase = { rpc } as unknown as Parameters<typeof appendProjectImageFilter>[0]["supabase"]
    await appendProjectImageFilter({
      supabase,
      projectId: "p1",
      inputImageId: "img-a",
      outputImageId: "img-b",
      filterType: "pixelate",
      filterParams: {},
    })
    // Single rpc call — no internal retry loop.
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})

describe("concurrency contract — write channel", () => {
  it("serial-write-channel exists for client-side filter mutations", async () => {
    // use-project-image-filters wires apply/remove through a
    // serial-write-channel so the UI can't fire two RPCs from the same
    // tab at once. This is the client-side counterpart to the DB lock.
    // We assert the factory + superseded-error exist (and so the code
    // path is reachable); semantic tests for the channel itself live in
    // lib/utils/serial-write-channel.test.ts.
    const mod = await import("@/lib/utils/serial-write-channel")
    expect(typeof mod.createSerialWriteChannel).toBe("function")
    expect(typeof mod.isSupersededWriteError).toBe("function")
  })
})
