import { beforeEach, describe, expect, it, vi } from "vitest"

import { fetchJson } from "@/lib/api/http"

describe("fetchJson", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("returns structured network error instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("socket hang up")
    }))

    const res = await fetchJson("/api/test", { method: "GET", credentials: "same-origin" })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.status).toBe(0)
      expect(res.error).toMatchObject({ stage: "network" })
    }
  })

  it("cleans inflight cache after network failure", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      } as Response)
    vi.stubGlobal("fetch", fetchMock)

    const first = await fetchJson<{ ok: boolean }>("/api/test", { method: "GET", credentials: "same-origin" })
    expect(first.ok).toBe(false)

    const second = await fetchJson<{ ok: boolean }>("/api/test", { method: "GET", credentials: "same-origin" })
    expect(second.ok).toBe(true)
    if (second.ok) expect(second.data).toMatchObject({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
