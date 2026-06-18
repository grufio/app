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

  it("GET hits the project-scoped URL without any query parameter", async () => {
    const okGet: FetchJsonResult<unknown> = { ok: true, status: 200, data: { exists: false } }
    fetchJsonMock.mockResolvedValueOnce(okGet)

    await getImageState("project-1")

    expect(fetchJsonMock).toHaveBeenCalledWith("/api/projects/project-1/image-state", {
      method: "GET",
      credentials: "same-origin",
    })
  })

  it("POST sends only transform fields (no image_id / role in body)", async () => {
    const okPost: FetchJsonResult<unknown> = { ok: true, status: 200, data: {} }
    fetchJsonMock.mockResolvedValueOnce(okPost)

    const body = {
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
      signal: undefined,
    })
  })

  it("POST forwards an AbortSignal when provided", async () => {
    const okPost: FetchJsonResult<unknown> = { ok: true, status: 200, data: {} }
    fetchJsonMock.mockResolvedValueOnce(okPost)

    const controller = new AbortController()
    await saveImageState(
      "project-1",
      { width_px_u: "1", height_px_u: "1", rotation_deg: 0 },
      { signal: controller.signal },
    )

    expect(fetchJsonMock).toHaveBeenCalledWith(
      "/api/projects/project-1/image-state",
      expect.objectContaining({ signal: controller.signal }),
    )
  })

  it("throws ApiError on failed POST (e.g. chain_invalid)", async () => {
    const failPost: FetchJsonResult<unknown> = { ok: false, status: 409, error: { stage: "chain_invalid" } }
    fetchJsonMock.mockResolvedValueOnce(failPost)

    await expect(
      saveImageState("project-1", {
        width_px_u: "1000",
        height_px_u: "1000",
        rotation_deg: 0,
      })
    ).rejects.toBeInstanceOf(ApiError)
  })

  it("throws ApiError on failed GET (e.g. schema_missing)", async () => {
    const failGet: FetchJsonResult<unknown> = { ok: false, status: 400, error: { stage: "schema_missing" } }
    fetchJsonMock.mockResolvedValueOnce(failGet)

    await expect(getImageState("project-1")).rejects.toBeInstanceOf(ApiError)
  })
})
