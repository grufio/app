import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { lineArtImageAndActivate } from "./lineart"

describe("lineArtImageAndActivate validation contract", () => {
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

  it("rejects smoothness values above 0.1", async () => {
    const result = await lineArtImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: {
        threshold1: 50,
        threshold2: 200,
        lineThickness: 2,
        invert: true,
        blurAmount: 3,
        minContourArea: 200,
        smoothness: 0.11,
      },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("validation")
      expect(result.reason).toBe("Invalid line art params")
    }
  })

  it("accepts smoothness 0.1 and continues to source lookup", async () => {
    const result = await lineArtImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: {
        threshold1: 50,
        threshold2: 200,
        lineThickness: 2,
        invert: true,
        blurAmount: 3,
        minContourArea: 200,
        smoothness: 0.1,
      },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("source_lookup")
    }
  })
})
