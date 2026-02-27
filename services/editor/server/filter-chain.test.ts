import { describe, expect, it, vi } from "vitest"

import { appendProjectImageFilter, cleanupOrphanFilterImage } from "@/services/editor/server/filter-chain"

describe("filter-chain service", () => {
  it("uses atomic append rpc", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    const supabase = { rpc } as unknown as Parameters<typeof appendProjectImageFilter>[0]["supabase"]
    const out = await appendProjectImageFilter({
      supabase,
      projectId: "p1",
      inputImageId: "i1",
      outputImageId: "i2",
      filterType: "pixelate",
      filterParams: { superpixel_width: 10 },
    })
    expect(out.ok).toBe(true)
    expect(rpc).toHaveBeenCalledWith("append_project_image_filter", expect.objectContaining({ p_project_id: "p1" }))
  })

  it("cleans up storage and db row", async () => {
    const remove = vi.fn().mockResolvedValue({ error: null })
    const from = vi.fn().mockReturnValue({ remove })
    const eqId = vi.fn().mockResolvedValue({ error: null })
    const eqProject = vi.fn().mockReturnValue({ eq: eqId })
    const dbFrom = vi.fn().mockReturnValue({ delete: vi.fn().mockReturnValue({ eq: eqProject }) })
    const supabase = {
      storage: { from },
      from: dbFrom,
    } as unknown as Parameters<typeof cleanupOrphanFilterImage>[0]["supabase"]

    await cleanupOrphanFilterImage({
      supabase,
      projectId: "p1",
      imageId: "i1",
      storagePath: "projects/p1/images/i1",
    })

    expect(from).toHaveBeenCalledWith("project_images")
    expect(remove).toHaveBeenCalledWith(["projects/p1/images/i1"])
    expect(dbFrom).toHaveBeenCalledWith("project_images")
    expect(eqProject).toHaveBeenCalledWith("project_id", "p1")
    expect(eqId).toHaveBeenCalledWith("id", "i1")
  })
})
