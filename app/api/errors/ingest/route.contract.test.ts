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

  describe("Slack fan-out", () => {
    const originalWebhook = process.env.SLACK_ALERT_WEBHOOK_URL
    let fetchMock: ReturnType<typeof vi.fn>

    beforeAll(() => {
      // Stub global fetch so we can assert what (and whether) the route
      // POSTs to Slack. Returning a 200 keeps the route out of its
      // catch-all error swallow.
      fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
      global.fetch = fetchMock as unknown as typeof fetch
    })

    afterAll(() => {
      // Vitest runs the global afterAll() above which restoreAllMocks();
      // we just need to drop our env-var override.
      if (originalWebhook == null) delete process.env.SLACK_ALERT_WEBHOOK_URL
      else process.env.SLACK_ALERT_WEBHOOK_URL = originalWebhook
    })

    it("does NOT fan out to Slack when SLACK_ALERT_WEBHOOK_URL is unset", async () => {
      delete process.env.SLACK_ALERT_WEBHOOK_URL
      fetchMock.mockClear()
      const res = await POST(
        makeRequest({ message: "hello", severity: "error", scope: "editor", code: "X" }, { ip: "1.1.1.1" })
      )
      expect(res.status).toBe(204)
      // Allow the void-promise to resolve before asserting fetch was not called.
      await new Promise((r) => setTimeout(r, 10))
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it("fans out to Slack on severity=error when webhook is set", async () => {
      process.env.SLACK_ALERT_WEBHOOK_URL = "https://hooks.slack.test/services/AAA/BBB/ccc"
      fetchMock.mockClear()
      const res = await POST(
        makeRequest(
          {
            message: "Filter chain corrupt",
            severity: "error",
            scope: "editor",
            code: "FILTER_CHAIN_CORRUPT",
            stage: "apply",
            context: { projectId: "p-1" },
          },
          { ip: "1.1.1.2" },
        ),
      )
      expect(res.status).toBe(204)
      await new Promise((r) => setTimeout(r, 10))
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [calledUrl, init] = fetchMock.mock.calls[0] ?? []
      expect(calledUrl).toBe("https://hooks.slack.test/services/AAA/BBB/ccc")
      const body = JSON.parse(String((init as RequestInit).body))
      expect(body.text).toContain("ERROR")
      expect(body.text).toContain("FILTER_CHAIN_CORRUPT")
      expect(body.text).toContain("Filter chain corrupt")
    })

    it("does NOT fan out for severity=info even with webhook set", async () => {
      process.env.SLACK_ALERT_WEBHOOK_URL = "https://hooks.slack.test/services/AAA/BBB/ccc"
      fetchMock.mockClear()
      const res = await POST(
        makeRequest({ message: "fyi", severity: "info", scope: "client" }, { ip: "1.1.1.3" })
      )
      expect(res.status).toBe(204)
      await new Promise((r) => setTimeout(r, 10))
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })
})
