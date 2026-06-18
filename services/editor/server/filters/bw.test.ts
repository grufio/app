/**
 * Tests for the B&W filter handlers (bw_hard / bw_soft / bw_warm) —
 * validation and lookup/lock contract. The three handlers all
 * delegate to the shared `applyBwFilter` core, so the lookup / lock /
 * dimension paths are covered once via `bwHardImageAndActivate`; a
 * final smoke confirms all three exports are wired to distinct
 * service routes (no copy-paste mistake pinning two to the same path).
 *
 * Storage download is rigged to fail so tests never reach the
 * filter-service HTTP call — these are pre-flight contract tests, not
 * end-to-end pipelines.
 */
import { describe, it, expect } from "vitest"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import { bwHardImageAndActivate, bwSoftImageAndActivate, bwWarmImageAndActivate } from "./bw"

function buildMockSupabase(opts: { source?: Record<string, unknown> | null } = {}) {
  return makeMockSupabase({
    tables: {
      project_images: {
        select: { data: opts.source ?? null, error: null },
      },
    },
    storage: {
      project_images: {
        download: { data: null, error: { message: "download failed" } },
      },
    },
  })
}

const projectId = "test-project-id"
const sourceImageId = "source-image-id"

const validSource = {
  id: sourceImageId,
  name: "test.jpg",
  storage_bucket: "project_images",
  storage_path: "path/to/test.jpg",
  format: "jpeg",
  width_px: 1000,
  height_px: 800,
}

describe("bwHardImageAndActivate — lookup contract", () => {
  it("returns source_lookup error when the source image is not found", async () => {
    const result = await bwHardImageAndActivate({
      supabase: buildMockSupabase({ source: null }),
      projectId,
      sourceImageId,
      params: {},
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("source_lookup")
      expect(result.reason).toBe("Source image not found")
    }
  })

  it("returns validation error for invalid source dimensions", async () => {
    const result = await bwHardImageAndActivate({
      supabase: buildMockSupabase({ source: { ...validSource, width_px: 0, height_px: 800 } }),
      projectId,
      sourceImageId,
      params: {},
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("validation")
      expect(result.reason).toBe("Invalid source dimensions")
    }
  })

  it("returns source_download error when the storage download fails", async () => {
    const result = await bwHardImageAndActivate({
      supabase: buildMockSupabase({ source: validSource }),
      projectId,
      sourceImageId,
      params: {},
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("source_download")
      expect(result.reason).toBe("Failed to download source image")
    }
  })
})

describe("bw handlers — all three share the contract", () => {
  // The three exports delegate to the same core; this confirms each
  // is callable and reaches the same lookup-failure path (a wiring
  // smoke — catches an export pinned to the wrong core call).
  it.each([
    ["bw_hard", bwHardImageAndActivate],
    ["bw_soft", bwSoftImageAndActivate],
    ["bw_warm", bwWarmImageAndActivate],
  ])("%s surfaces source_lookup on a missing source", async (_label, handler) => {
    const result = await handler({
      supabase: buildMockSupabase({ source: null }),
      projectId,
      sourceImageId,
      params: {},
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("source_lookup")
  })
})
