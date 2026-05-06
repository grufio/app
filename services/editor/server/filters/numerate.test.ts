import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { numerateImageAndActivate } from "./numerate"

describe("numerateImageAndActivate validation contract", () => {
  let mockSupabase: SupabaseClient<Database>
  const projectId = "test-project-id"
  const sourceImageId = "source-image-id"

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              })),
            })),
          })),
        })),
      })),
    } as unknown as SupabaseClient<Database>
  })

  it("rejects superpixelWidth < 1", async () => {
    const result = await numerateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { superpixelWidth: 0, superpixelHeight: 10, strokeWidth: 2, showColors: true },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("validation")
      expect(result.reason).toBe("Invalid numerate params")
    }
  })

  it("rejects superpixelHeight < 1", async () => {
    const result = await numerateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { superpixelWidth: 10, superpixelHeight: 0, strokeWidth: 2, showColors: false },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("rejects strokeWidth < 1", async () => {
    const result = await numerateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { superpixelWidth: 10, superpixelHeight: 10, strokeWidth: 0, showColors: true },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("rejects strokeWidth > 20", async () => {
    const result = await numerateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { superpixelWidth: 10, superpixelHeight: 10, strokeWidth: 21, showColors: true },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("rejects NaN superpixelWidth (toInt returns null)", async () => {
    const result = await numerateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { superpixelWidth: NaN, superpixelHeight: 10, strokeWidth: 2, showColors: true },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("accepts boundary values and continues to source lookup", async () => {
    const result = await numerateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { superpixelWidth: 1, superpixelHeight: 1, strokeWidth: 20, showColors: false },
    })
    // Source lookup returns null → 404 source_lookup. The validation passed.
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("source_lookup")
  })
})
