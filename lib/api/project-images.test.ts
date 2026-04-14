import { beforeEach, describe, expect, it, vi } from "vitest"

import { fetchJson, invalidateFetchJsonGetCache } from "@/lib/api/http"
import { deleteMasterImageById, getOrCreateFilterWorkingCopy } from "@/lib/api/project-images"
import type { FetchJsonResult } from "@/lib/api/http"

vi.mock("@/lib/api/http", () => ({
  fetchJson: vi.fn(),
  invalidateFetchJsonGetCache: vi.fn(),
}))

const fetchJsonMock = vi.mocked(fetchJson)
const invalidateFetchJsonGetCacheMock = vi.mocked(invalidateFetchJsonGetCache)

describe("project-images API wrapper", () => {
  beforeEach(() => {
    fetchJsonMock.mockReset()
    invalidateFetchJsonGetCacheMock.mockReset()
  })

  it("maps filter panel payload including stack", async () => {
    const ok: FetchJsonResult<unknown> = {
      ok: true,
      status: 200,
      data: {
        exists: true,
        id: "img-2",
        signed_url: "https://signed.test/img-2",
        width_px: 1000,
        height_px: 800,
        storage_path: "projects/p/images/img-2",
        source_image_id: "img-1",
        name: "base (pixelate)",
        is_filter_result: true,
        stack: [
          { id: "img-2", name: "base (pixelate)", filterType: "pixelate", source_image_id: "img-1" },
          { id: "img-3", name: "base (line art)", filterType: "lineart", source_image_id: "img-2" },
        ],
      },
    }
    fetchJsonMock.mockResolvedValueOnce(ok)

    const out = await getOrCreateFilterWorkingCopy("project-1")
    expect(out.exists).toBe(true)
    if (out.exists) {
      expect(out.id).toBe("img-2")
      expect(out.isFilterResult).toBe(true)
      expect(out.stack).toHaveLength(2)
      expect(out.stack[1]).toMatchObject({ filterType: "lineart", source_image_id: "img-2" })
    }
  })

  it("maps explicit no_active_image empty state", async () => {
    const ok: FetchJsonResult<unknown> = {
      ok: true,
      status: 200,
      data: { ok: true, exists: false, stage: "no_active_image" },
    }
    fetchJsonMock.mockResolvedValueOnce(ok)

    const out = await getOrCreateFilterWorkingCopy("project-1")
    expect(out).toEqual({ exists: false, stage: "no_active_image" })
  })

  it("invalidates list cache before and after successful delete-by-id", async () => {
    const ok: FetchJsonResult<unknown> = {
      ok: true,
      status: 200,
      data: { ok: true },
    }
    fetchJsonMock.mockResolvedValueOnce(ok)

    await deleteMasterImageById("project-1", "img-1")

    expect(invalidateFetchJsonGetCacheMock).toHaveBeenNthCalledWith(1, "/api/projects/project-1/images/master/list")
    expect(invalidateFetchJsonGetCacheMock).toHaveBeenNthCalledWith(2, "/api/projects/project-1/images/master")
    expect(invalidateFetchJsonGetCacheMock).toHaveBeenNthCalledWith(3, "/api/projects/project-1/images/master/list")
    expect(invalidateFetchJsonGetCacheMock).toHaveBeenNthCalledWith(4, "/api/projects/project-1/images/master")
  })

  it("invalidates cache again when delete-by-id fails with stale_selection", async () => {
    const stale: FetchJsonResult<unknown> = {
      ok: false,
      status: 409,
      error: { stage: "stale_selection", error: "Delete target is stale. Refresh selection." },
    }
    fetchJsonMock.mockResolvedValueOnce(stale)

    await expect(deleteMasterImageById("project-1", "img-stale")).rejects.toThrow("stage=stale_selection")
    expect(invalidateFetchJsonGetCacheMock).toHaveBeenNthCalledWith(1, "/api/projects/project-1/images/master/list")
    expect(invalidateFetchJsonGetCacheMock).toHaveBeenNthCalledWith(2, "/api/projects/project-1/images/master")
    expect(invalidateFetchJsonGetCacheMock).toHaveBeenNthCalledWith(3, "/api/projects/project-1/images/master/list")
    expect(invalidateFetchJsonGetCacheMock).toHaveBeenNthCalledWith(4, "/api/projects/project-1/images/master")
  })
})
