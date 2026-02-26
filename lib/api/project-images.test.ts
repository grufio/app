import { beforeEach, describe, expect, it, vi } from "vitest"

import { fetchJson } from "@/lib/api/http"
import { getOrCreateFilterWorkingCopy } from "@/lib/api/project-images"
import type { FetchJsonResult } from "@/lib/api/http"

vi.mock("@/lib/api/http", () => ({
  fetchJson: vi.fn(),
  invalidateFetchJsonGetCache: vi.fn(),
}))

const fetchJsonMock = vi.mocked(fetchJson)

describe("project-images API wrapper", () => {
  beforeEach(() => {
    fetchJsonMock.mockReset()
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
})
