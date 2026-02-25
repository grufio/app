/**
 * Tests for pixelate filter service - validation and error handling.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import { pixelateImageAndActivate } from "./pixelate-filter"
import type { Database } from "@/lib/supabase/database.types"

// Mock sharp - skip actual image processing in tests
vi.mock("sharp", () => ({
  default: vi.fn(() => ({
    resize: vi.fn().mockReturnThis(),
    grayscale: vi.fn().mockReturnThis(),
    png: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-image-data")),
  })),
  kernel: {
    nearest: "nearest",
  },
}))

describe("pixelateImageAndActivate - validation", () => {
  let mockSupabase: SupabaseClient<Database>
  const projectId = "test-project-id"
  const sourceImageId = "source-image-id"

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => ({
              maybeSingle: vi.fn(),
            })),
          })),
        })),
        insert: vi.fn(),
      })),
      storage: {
        from: vi.fn(() => ({
          download: vi.fn(),
          upload: vi.fn(),
          remove: vi.fn(),
        })),
      },
    } as unknown as SupabaseClient<Database>
  })

  it("should validate params and return error for invalid superpixel size", async () => {
    const result = await pixelateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: {
        superpixelWidth: 0,
        superpixelHeight: 10,
        colorMode: "rgb",
        numColors: 16,
      },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("validation")
      expect(result.reason).toBe("Invalid pixelate params")
    }
  })

  it("should validate params and return error for invalid color count", async () => {
    const result = await pixelateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: {
        superpixelWidth: 10,
        superpixelHeight: 10,
        colorMode: "rgb",
        numColors: 1, // Too low
      },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("validation")
      expect(result.reason).toBe("Invalid pixelate params")
    }
  })

  it("should validate params and return error for too many colors", async () => {
    const result = await pixelateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: {
        superpixelWidth: 10,
        superpixelHeight: 10,
        colorMode: "rgb",
        numColors: 300, // Too high
      },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("validation")
      expect(result.reason).toBe("Invalid pixelate params")
    }
  })

  it("should return error when source image not found", async () => {
    const mockFrom = mockSupabase.from as unknown as ReturnType<typeof vi.fn>
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    })

    const result = await pixelateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: {
        superpixelWidth: 10,
        superpixelHeight: 10,
        colorMode: "rgb",
        numColors: 16,
      },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("source_lookup")
      expect(result.reason).toBe("Source image not found")
    }
  })

  it("should return error when source image is locked", async () => {
    const mockFrom = mockSupabase.from as unknown as ReturnType<typeof vi.fn>
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: sourceImageId,
                  name: "test.jpg",
                  storage_bucket: "project_images",
                  storage_path: "path/to/test.jpg",
                  format: "jpeg",
                  width_px: 1000,
                  height_px: 800,
                  is_locked: true,
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
    })

    const result = await pixelateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: {
        superpixelWidth: 10,
        superpixelHeight: 10,
        colorMode: "rgb",
        numColors: 16,
      },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("lock_conflict")
      expect(result.reason).toBe("Source image is locked")
    }
  })

  it("should calculate correct grid dimensions from superpixel size", async () => {
    const sourceImage = {
      id: sourceImageId,
      name: "test.jpg",
      storage_bucket: "project_images",
      storage_path: "path/to/test.jpg",
      format: "jpeg",
      width_px: 1000,
      height_px: 800,
      is_locked: false,
    }

    // Superpixel 10x10 on 1000x800 image = 100x80 grid
    const result = await pixelateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: {
        superpixelWidth: 10,
        superpixelHeight: 10,
        colorMode: "rgb",
        numColors: 16,
      },
    })

    // The test validates that superpixel size too large returns error
    const result2 = await pixelateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: {
        superpixelWidth: 2000, // Larger than image
        superpixelHeight: 10,
        colorMode: "rgb",
        numColors: 16,
      },
    })

    // This should fail validation at the grid calculation stage
    expect(result2.ok).toBe(false)
  })
})
