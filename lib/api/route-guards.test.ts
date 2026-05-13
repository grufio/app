/**
 * Unit tests for route guard helpers.
 */
import { describe, expect, it } from "vitest"

import { isUuid, jsonError, readJson } from "./route-guards"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe("route-guards", () => {
  it("isUuid accepts valid UUIDs and rejects invalid ones", () => {
    expect(isUuid("c104be01-d7b0-4af4-a446-8326cd47a282")).toBe(true)
    expect(isUuid("not-a-uuid")).toBe(false)
    expect(isUuid("c104be01d7b04af4a4468326cd47a282")).toBe(false)
  })

  it("readJson rejects requests larger than maxBytes via content-length", async () => {
    const req = new Request("http://test.local", {
      method: "POST",
      headers: { "content-length": String(1024) },
      body: JSON.stringify({ ok: true }),
    })
    const res = await readJson(req, { stage: "body", maxBytes: 10 })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.res.status).toBe(413)
      const body = await res.res.json()
      expect(body.stage).toBe("body")
    }
  })

  it("jsonError emits a correlation id in body and X-Request-Id header", async () => {
    const res = jsonError("Invalid input", 400, { stage: "validation" })
    const headerId = res.headers.get("X-Request-Id")
    expect(headerId).toBeTruthy()
    expect(headerId).toMatch(UUID_PATTERN)
    const body = await res.json()
    expect(body.correlationId).toBe(headerId)
    expect(body.stage).toBe("validation")
    expect(body.error).toBe("Invalid input")
  })

  it("jsonError generates a fresh correlation id per call", async () => {
    const a = jsonError("err", 400, { stage: "validation" })
    const b = jsonError("err", 400, { stage: "validation" })
    expect(a.headers.get("X-Request-Id")).not.toBe(b.headers.get("X-Request-Id"))
  })
})

