import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api/api-error"
import { fetchJson } from "@/lib/api/http"
import { getImageState, saveImageState } from "@/lib/api/image-state"
import type { FetchJsonResult } from "@/lib/api/http"

vi.mock("@/lib/api/http", () => ({
  fetchJson: vi.fn(),
}))

const fetchJsonMock = vi.mocked(fetchJson)

describe("image-state API wrapper", () => {
  beforeEach(() => {
    fetchJsonMock.mockReset()
  })

  it("builds GET URL without imageId", async () => {
    const okGet: FetchJsonResult<unknown> = { ok: true, status: 200, data: { exists: false } }
    fetchJsonMock.mockResolvedValueOnce(okGet)

    await getImageState("project-1")

    expect(fetchJsonMock).toHaveBeenCalledWith("/api/projects/project-1/image-state", {
      method: "GET",
      credentials: "same-origin",
    })
  })

  it("builds GET URL with imageId query", async () => {
    const okGet: FetchJsonResult<unknown> = { ok: true, status: 200, data: { exists: false } }
    fetchJsonMock.mockResolvedValueOnce(okGet)

    await getImageState("project-1", "image-1")

    expect(fetchJsonMock).toHaveBeenCalledWith("/api/projects/project-1/image-state?imageId=image-1", {
      method: "GET",
      credentials: "same-origin",
    })
  })

  it("builds POST URL without imageId by default", async () => {
    const okPost: FetchJsonResult<unknown> = { ok: true, status: 200, data: {} }
    fetchJsonMock.mockResolvedValueOnce(okPost)

    const body = {
      role: "master" as const,
      image_id: "image-1",
      width_px_u: "1000",
      height_px_u: "1000",
      rotation_deg: 0,
    }

    await saveImageState("project-1", body)

    expect(fetchJsonMock).toHaveBeenCalledWith("/api/projects/project-1/image-state", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  })

  it("builds POST URL with explicit imageId query", async () => {
    const okPost: FetchJsonResult<unknown> = { ok: true, status: 200, data: {} }
    fetchJsonMock.mockResolvedValueOnce(okPost)

    const body = {
      role: "master" as const,
      image_id: "image-1",
      width_px_u: "1000",
      height_px_u: "1000",
      rotation_deg: 0,
    }

    await saveImageState("project-1", body, "image-1")

    expect(fetchJsonMock).toHaveBeenCalledWith("/api/projects/project-1/image-state?imageId=image-1", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  })

  it("throws ApiError on failed POST", async () => {
    const failPost: FetchJsonResult<unknown> = { ok: false, status: 409, error: { stage: "active_image_mismatch" } }
    fetchJsonMock.mockResolvedValueOnce(failPost)

    await expect(
      saveImageState("project-1", {
        role: "master",
        image_id: "image-1",
        width_px_u: "1000",
        height_px_u: "1000",
        rotation_deg: 0,
      })
    ).rejects.toBeInstanceOf(ApiError)
  })
})

