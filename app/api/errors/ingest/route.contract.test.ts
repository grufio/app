import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { POST } from "./route"

// Suppress the structured `[error-ingest]` console.error logs the route
// emits on success — they're noise in test output.
beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
})
afterAll(() => {
  vi.restoreAllMocks()
})

function makeRequest(body: unknown, opts: { ip?: string; contentLength?: string } = {}): Request {
  const json = JSON.stringify(body)
  const headers = new Headers({ "content-type": "application/json" })
  if (opts.ip) headers.set("x-forwarded-for", opts.ip)
  if (opts.contentLength) headers.set("content-length", opts.contentLength)
  return new Request("http://localhost/api/errors/ingest", {
    method: "POST",
    headers,
    body: json,
  })
}

describe("POST /api/errors/ingest", () => {
  it("returns 204 for a well-formed event", async () => {
    const res = await POST(
      makeRequest({
        schemaVersion: "v1",
        timestamp: "2026-05-06T20:00:00.000Z",
        message: "hello",
        scope: "client",
      }, { ip: "127.0.0.1" })
    )
    expect(res.status).toBe(204)
  })

  it("returns 400 for invalid JSON", async () => {
    const req = new Request("http://localhost/api/errors/ingest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ not json",
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("returns 400 when message is missing", async () => {
    const res = await POST(makeRequest({ scope: "client" }, { ip: "127.0.0.2" }))
    expect(res.status).toBe(400)
  })

  it("returns 413 when content-length exceeds 32 KB", async () => {
    const big = "x".repeat(40 * 1024)
    const res = await POST(
      makeRequest({ message: big }, { ip: "127.0.0.3", contentLength: String(40 * 1024) })
    )
    expect(res.status).toBe(413)
  })

  it("rate-limits >60 events per minute from the same IP", async () => {
    const ip = "10.0.0.99"
    for (let i = 0; i < 60; i++) {
      const r = await POST(makeRequest({ message: `msg-${i}` }, { ip }))
      expect(r.status).toBe(204)
    }
    const overflow = await POST(makeRequest({ message: "boom" }, { ip }))
    expect(overflow.status).toBe(429)
  })
})
