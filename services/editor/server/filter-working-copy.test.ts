/**
 * Tests for filter working copy creation and management.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import { getOrCreateFilterWorkingCopy } from "./filter-working-copy"
import type { Database } from "@/lib/supabase/database.types"

describe("getOrCreateFilterWorkingCopy", () => {
  let mockSupabase: SupabaseClient<Database>
  const projectId = "test-project-id"
  const activeImageId = "active-image-id"
  const workingCopyId = "working-copy-id"

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                maybeSingle: vi.fn(),
              })),
            })),
            is: vi.fn(() => ({
              maybeSingle: vi.fn(),
            })),
            like: vi.fn(() => ({
              is: vi.fn(() => ({
                maybeSingle: vi.fn(),
              })),
            })),
          })),
          is: vi.fn(() => ({
            maybeSingle: vi.fn(),
          })),
        })),
        insert: vi.fn(() => ({
          select: vi.fn(),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(),
        })),
      })),
      storage: {
        from: vi.fn(() => ({
          download: vi.fn(),
          upload: vi.fn(),
          createSignedUrl: vi.fn(),
          remove: vi.fn(),
        })),
      },
    } as unknown as SupabaseClient<Database>
  })

  it("should return error when no active image exists", async () => {
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

    const result = await getOrCreateFilterWorkingCopy({ supabase: mockSupabase, projectId })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("active_lookup")
      expect(result.reason).toBe("Active image not found")
    }
  })

  it("should return existing working copy when it matches active image", async () => {
    const activeImage = {
      id: activeImageId,
      name: "test.jpg",
      storage_bucket: "project_images",
      storage_path: "path/to/active.jpg",
      format: "jpeg",
      width_px: 1000,
      height_px: 800,
      file_size_bytes: 50000,
      source_image_id: null,
    }

    const existingCopy = {
      id: workingCopyId,
      storage_bucket: "project_images",
      storage_path: "path/to/working.jpg",
      width_px: 1000,
      height_px: 800,
      source_image_id: activeImageId,
      name: "test.jpg (filter working)",
    }

    let callCount = 0
    const mockFrom = mockSupabase.from as unknown as ReturnType<typeof vi.fn>
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: callCount++ === 0 ? activeImage : null,
                error: null,
              }),
            }),
            like: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: existingCopy, error: null }),
              }),
            }),
          }),
        }),
      }),
    }))

    const mockStorage = mockSupabase.storage as unknown as {
      from: ReturnType<typeof vi.fn>
    }
    mockStorage.from.mockReturnValue({
      createSignedUrl: vi.fn().mockResolvedValue({
        data: { signedUrl: "https://signed-url.com/working.jpg" },
        error: null,
      }),
    })

    const result = await getOrCreateFilterWorkingCopy({ supabase: mockSupabase, projectId })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.id).toBe(workingCopyId)
      expect(result.signedUrl).toBe("https://signed-url.com/working.jpg")
      expect(result.sourceImageId).toBe(null) // Active image has no source
    }
  })

  it("should delete outdated working copy and create new one", async () => {
    const activeImage = {
      id: activeImageId,
      name: "test.jpg",
      storage_bucket: "project_images",
      storage_path: "path/to/active.jpg",
      format: "jpeg",
      width_px: 1000,
      height_px: 800,
      file_size_bytes: 50000,
      source_image_id: null,
    }

    const outdatedCopy = {
      id: "old-working-copy-id",
      storage_bucket: "project_images",
      storage_path: "path/to/old-working.jpg",
      width_px: 800,
      height_px: 600,
      source_image_id: "old-active-image-id", // Points to old image
      name: "old.jpg (filter working)",
    }

    const mockFrom = mockSupabase.from as unknown as ReturnType<typeof vi.fn>
    mockFrom.mockImplementation((table: string) => {
      if (table === "project_images") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: activeImage,
                    error: null,
                  }),
                  like: vi.fn().mockReturnValue({
                    is: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: outdatedCopy,
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      return {}
    })

    const mockStorage = mockSupabase.storage as unknown as {
      from: ReturnType<typeof vi.fn>
    }
    mockStorage.from.mockReturnValue({
      download: vi.fn().mockResolvedValue({
        data: new Blob([new ArrayBuffer(100)]),
        error: null,
      }),
      upload: vi.fn().mockResolvedValue({ error: null }),
      createSignedUrl: vi.fn().mockResolvedValue({
        data: { signedUrl: "https://signed-url.com/new-working.jpg" },
        error: null,
      }),
    })

    const result = await getOrCreateFilterWorkingCopy({ supabase: mockSupabase, projectId })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.widthPx).toBe(1000)
      expect(result.heightPx).toBe(800)
    }
  })

  it("should handle storage download failure gracefully", async () => {
    const activeImage = {
      id: activeImageId,
      name: "test.jpg",
      storage_bucket: "project_images",
      storage_path: "path/to/active.jpg",
      format: "jpeg",
      width_px: 1000,
      height_px: 800,
      file_size_bytes: 50000,
      source_image_id: null,
    }

    const mockFrom = mockSupabase.from as unknown as ReturnType<typeof vi.fn>
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: activeImage,
                error: null,
              }),
              like: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    })

    const mockStorage = mockSupabase.storage as unknown as {
      from: ReturnType<typeof vi.fn>
    }
    mockStorage.from.mockReturnValue({
      download: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Storage error" },
      }),
    })

    const result = await getOrCreateFilterWorkingCopy({ supabase: mockSupabase, projectId })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("storage_download")
      expect(result.reason).toBe("Failed to download active image")
    }
  })
})
