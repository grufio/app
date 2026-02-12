/**
 * Unit tests for route guard helpers.
 */
import { describe, expect, it } from "vitest"

import { isUuid, readJson } from "./route-guards"

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
})

