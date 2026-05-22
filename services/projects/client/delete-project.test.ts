import { afterEach, describe, expect, it, vi } from "vitest"

import { deleteProjectClient } from "./delete-project"

const PID = "11111111-1111-4111-8111-111111111111"

afterEach(() => vi.unstubAllGlobals())

describe("deleteProjectClient", () => {
  it("returns ok on a 2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })))
    expect(await deleteProjectClient(PID)).toEqual({ ok: true })
  })

  it("surfaces the server error message + status on failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 409, json: async () => ({ error: "FK restrict" }) })))
    expect(await deleteProjectClient(PID)).toEqual({ ok: false, error: "FK restrict", status: 409 })
  })

  it("falls back to statusText when the body is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => {
        throw new Error("not json")
      },
    })))
    expect(await deleteProjectClient(PID)).toEqual({ ok: false, error: "Internal Server Error", status: 500 })
  })
})
