import { afterEach, describe, expect, it, vi } from "vitest"

import { createProjectClient } from "./create-project"

const input = { name: "P", unit: "mm" as const, width_value: 210, height_value: 297 }

afterEach(() => vi.unstubAllGlobals())

describe("createProjectClient", () => {
  it("returns the new id on a 2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ id: "abc" }) })))
    expect(await createProjectClient(input)).toEqual({ id: "abc" })
  })

  it("throws with the server body text on a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 400, text: async () => "bad request" })))
    await expect(createProjectClient(input)).rejects.toThrow("bad request")
  })

  it("throws when the response is missing an id", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })))
    await expect(createProjectClient(input)).rejects.toThrow(/missing project id/)
  })

  it("posts JSON to the create endpoint", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ id: "abc" }) }))
    vi.stubGlobal("fetch", fetchMock)
    await createProjectClient(input)
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/create",
      expect.objectContaining({ method: "POST", body: JSON.stringify(input) }),
    )
  })
})
