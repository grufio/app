import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { reportError } from "./error-reporting"

describe("reportError", () => {
  const origIngest = process.env.NEXT_PUBLIC_ERROR_INGEST_URL
  let consoleSpy: ReturnType<typeof vi.spyOn>
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    fetchSpy = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal("fetch", fetchSpy)
  })

  afterEach(() => {
    consoleSpy.mockRestore()
    vi.unstubAllGlobals()
    if (origIngest == null) delete process.env.NEXT_PUBLIC_ERROR_INGEST_URL
    else process.env.NEXT_PUBLIC_ERROR_INGEST_URL = origIngest
  })

  it("always logs locally with the structured payload", async () => {
    delete process.env.NEXT_PUBLIC_ERROR_INGEST_URL
    await reportError(new Error("boom"), { scope: "server", stage: "auth.callback" })
    expect(consoleSpy).toHaveBeenCalledTimes(1)
    const payload = consoleSpy.mock.calls[0]?.[1] as Record<string, unknown>
    expect(payload.message).toBe("boom")
    expect(payload.scope).toBe("server")
    expect(payload.stage).toBe("auth.callback")
    expect(payload.schemaVersion).toBe("v1")
    expect(typeof payload.timestamp).toBe("string")
  })

  it("does not POST when NEXT_PUBLIC_ERROR_INGEST_URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_ERROR_INGEST_URL
    await reportError(new Error("x"))
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("POSTs the payload to the ingest URL when configured", async () => {
    process.env.NEXT_PUBLIC_ERROR_INGEST_URL = "https://errors.example.com/ingest"
    await reportError(new Error("network"), { scope: "api", stage: "filter.apply" })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(url).toBe("https://errors.example.com/ingest")
    expect(init.method).toBe("POST")
    expect(init.headers["content-type"]).toBe("application/json")
    const body = JSON.parse(init.body)
    expect(body.message).toBe("network")
    expect(body.scope).toBe("api")
    expect(body.stage).toBe("filter.apply")
  })

  it("ignores invalid ingest URLs (no throw, no POST)", async () => {
    process.env.NEXT_PUBLIC_ERROR_INGEST_URL = "not a url"
    await reportError(new Error("x"))
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("never throws when the ingest fetch fails", async () => {
    process.env.NEXT_PUBLIC_ERROR_INGEST_URL = "https://errors.example.com/ingest"
    fetchSpy.mockRejectedValueOnce(new Error("network down"))
    await expect(reportError(new Error("x"))).resolves.toBeUndefined()
  })

  it("normalises non-Error inputs", async () => {
    delete process.env.NEXT_PUBLIC_ERROR_INGEST_URL
    await reportError("plain string")
    const payload = consoleSpy.mock.calls[0]?.[1] as Record<string, unknown>
    expect(payload.message).toBe("plain string")
  })
})
