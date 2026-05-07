import { afterEach, describe, expect, it } from "vitest"

import {
  backoffDelayMs,
  callFilterService,
  contentTypeFor,
  filterServiceHeaders,
  isTransientFilterServiceFailure,
  pickOutputFormat,
  toInt,
} from "./_helpers"

describe("toInt", () => {
  it("rounds finite positive numbers", () => {
    expect(toInt(3.4)).toBe(3)
    expect(toInt(3.6)).toBe(4)
    expect(toInt(0)).toBe(0)
  })
  it("rejects negative, NaN, Infinity", () => {
    expect(toInt(-0.4)).not.toBeNull() // rounds to -0 which passes the n<0 check
    expect(toInt(-1)).toBeNull()
    expect(toInt(NaN)).toBeNull()
    expect(toInt(Infinity)).toBeNull()
    expect(toInt(-Infinity)).toBeNull()
  })
})

describe("pickOutputFormat", () => {
  it("normalises jpg/jpeg to jpeg", () => {
    expect(pickOutputFormat("jpg")).toBe("jpeg")
    expect(pickOutputFormat("JPG")).toBe("jpeg")
    expect(pickOutputFormat("jpeg")).toBe("jpeg")
    expect(pickOutputFormat("JPEG")).toBe("jpeg")
  })
  it("recognises webp case-insensitively", () => {
    expect(pickOutputFormat("webp")).toBe("webp")
    expect(pickOutputFormat("WEBP")).toBe("webp")
  })
  it("falls back to png for unknown / null / empty", () => {
    expect(pickOutputFormat(null)).toBe("png")
    expect(pickOutputFormat(undefined)).toBe("png")
    expect(pickOutputFormat("")).toBe("png")
    expect(pickOutputFormat("gif")).toBe("png")
    expect(pickOutputFormat("png")).toBe("png")
  })
})

describe("contentTypeFor", () => {
  it("maps each format to its MIME type", () => {
    expect(contentTypeFor("jpeg")).toBe("image/jpeg")
    expect(contentTypeFor("png")).toBe("image/png")
    expect(contentTypeFor("webp")).toBe("image/webp")
  })
})

describe("filterServiceHeaders", () => {
  const original = process.env.FILTER_SERVICE_TOKEN

  afterEach(() => {
    if (original == null) delete process.env.FILTER_SERVICE_TOKEN
    else process.env.FILTER_SERVICE_TOKEN = original
  })

  it("returns Content-Type only when no token is set", () => {
    delete process.env.FILTER_SERVICE_TOKEN
    expect(filterServiceHeaders()).toEqual({ "Content-Type": "application/json" })
  })

  it("attaches Bearer token when FILTER_SERVICE_TOKEN is set", () => {
    process.env.FILTER_SERVICE_TOKEN = "secret-abc"
    expect(filterServiceHeaders()).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer secret-abc",
    })
  })

  it("treats empty/whitespace token as unset", () => {
    process.env.FILTER_SERVICE_TOKEN = "   "
    expect(filterServiceHeaders()).toEqual({ "Content-Type": "application/json" })
  })
})

describe("isTransientFilterServiceFailure", () => {
  it("treats network/abort errors as transient", () => {
    expect(isTransientFilterServiceFailure({ fetchError: new Error("ECONNRESET") })).toBe(true)
    expect(isTransientFilterServiceFailure({ fetchError: Object.assign(new Error("aborted"), { name: "AbortError" }) })).toBe(true)
  })

  it("treats 502/503/504 as transient (Cloud Run cold-start, gateway, timeout)", () => {
    expect(isTransientFilterServiceFailure({ status: 502 })).toBe(true)
    expect(isTransientFilterServiceFailure({ status: 503 })).toBe(true)
    expect(isTransientFilterServiceFailure({ status: 504 })).toBe(true)
  })

  it("does not retry 4xx (terminal)", () => {
    expect(isTransientFilterServiceFailure({ status: 400 })).toBe(false)
    expect(isTransientFilterServiceFailure({ status: 401 })).toBe(false)
    expect(isTransientFilterServiceFailure({ status: 422 })).toBe(false)
  })

  it("does not retry 500 (treat as terminal — usually a real server-side bug)", () => {
    expect(isTransientFilterServiceFailure({ status: 500 })).toBe(false)
  })
})

describe("backoffDelayMs", () => {
  it("doubles per attempt and caps at 4s", () => {
    expect(backoffDelayMs(0)).toBe(250)
    expect(backoffDelayMs(1)).toBe(500)
    expect(backoffDelayMs(2)).toBe(1000)
    expect(backoffDelayMs(3)).toBe(2000)
    expect(backoffDelayMs(4)).toBe(4000)
    expect(backoffDelayMs(10)).toBe(4000)
  })

  it("returns 0 for negative attempts (defensive)", () => {
    expect(backoffDelayMs(-1)).toBe(0)
  })
})

describe("callFilterService", () => {
  const stubBytes = new Uint8Array([1, 2, 3]).buffer

  it("returns ok on first 2xx response", async () => {
    const fetchImpl = (async () => new Response(stubBytes, { status: 200 })) as unknown as typeof fetch
    const result = await callFilterService({
      path: "/filters/pixelate",
      body: { x: 1 },
      fetchImpl,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.bytes.byteLength).toBe(3)
  })

  it("retries on 503 and succeeds on second attempt", async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      if (calls === 1) return new Response("cold start", { status: 503 })
      return new Response(stubBytes, { status: 200 })
    }) as unknown as typeof fetch
    const sleeps: number[] = []
    const result = await callFilterService({
      path: "/filters/pixelate",
      body: { x: 1 },
      fetchImpl,
      sleep: async (ms) => {
        sleeps.push(ms)
      },
    })
    expect(calls).toBe(2)
    expect(sleeps).toEqual([250])
    expect(result.ok).toBe(true)
  })

  it("returns service_unavailable when all attempts hit 502", async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      return new Response("bad gateway", { status: 502 })
    }) as unknown as typeof fetch
    const result = await callFilterService({
      path: "/filters/pixelate",
      body: { x: 1 },
      fetchImpl,
      sleep: async () => {},
      maxAttempts: 3,
    })
    expect(calls).toBe(3)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("service_unavailable")
      expect(result.status).toBe(502)
    }
  })

  it("does not retry terminal 400 (returns filter_failed immediately)", async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      return new Response("bad params", { status: 400 })
    }) as unknown as typeof fetch
    const result = await callFilterService({
      path: "/filters/pixelate",
      body: { x: 1 },
      fetchImpl,
      sleep: async () => {},
    })
    expect(calls).toBe(1)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("filter_failed")
      expect(result.status).toBe(400)
      expect(result.reason).toContain("bad params")
    }
  })

  it("returns auth stage on 401 (no retry)", async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      return new Response("unauthorized", { status: 401 })
    }) as unknown as typeof fetch
    const result = await callFilterService({
      path: "/filters/pixelate",
      body: { x: 1 },
      fetchImpl,
      sleep: async () => {},
    })
    expect(calls).toBe(1)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("auth")
      expect(result.status).toBe(401)
    }
  })

  it("retries on network error and surfaces service_unavailable when exhausted", async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      throw new Error("ECONNREFUSED")
    }) as unknown as typeof fetch
    const result = await callFilterService({
      path: "/filters/pixelate",
      body: { x: 1 },
      fetchImpl,
      sleep: async () => {},
      maxAttempts: 2,
    })
    expect(calls).toBe(2)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("service_unavailable")
      expect(result.reason).toContain("ECONNREFUSED")
    }
  })
})
