/**
 * Tests for pixelate filter service - validation and error handling.
 */
import { describe, it, expect, vi } from "vitest"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import { pixelateImageAndActivate } from "./pixelate"

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

/**
 * Source-image fixture used when the production code reaches the
 * lookup stage. Tests vary `is_locked` to exercise the lock-conflict
 * path. Storage download is rigged to fail so we never hit sharp/pixel
 * processing — these are validation/lookup contract tests, not
 * end-to-end pipelines.
 */
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

describe("pixelateImageAndActivate - validation", () => {
  const projectId = "test-project-id"
  const sourceImageId = "source-image-id"
  const mockSupabase = buildMockSupabase()

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
    const result = await pixelateImageAndActivate({
      supabase: buildMockSupabase({ source: null }),
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
    const lockedSupabase = buildMockSupabase({
      source: {
        id: sourceImageId,
        name: "test.jpg",
        storage_bucket: "project_images",
        storage_path: "path/to/test.jpg",
        format: "jpeg",
        width_px: 1000,
        height_px: 800,
        is_locked: true,
      },
    })

    const result = await pixelateImageAndActivate({
      supabase: lockedSupabase,
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

  it("should fail when superpixel size exceeds source dimensions", async () => {
    const unlockedSupabase = buildMockSupabase({
      source: {
        id: sourceImageId,
        name: "test.jpg",
        storage_bucket: "project_images",
        storage_path: "path/to/test.jpg",
        format: "jpeg",
        width_px: 1000,
        height_px: 800,
        is_locked: false,
      },
    })

    const result = await pixelateImageAndActivate({
      supabase: unlockedSupabase,
      projectId,
      sourceImageId,
      params: {
        superpixelWidth: 2000, // Larger than image
        superpixelHeight: 10,
        colorMode: "rgb",
        numColors: 16,
      },
    })

    expect(result.ok).toBe(false)
  })
})
