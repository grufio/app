import { describe, expect, it } from "vitest"

import { deriveImageBarMode } from "./image-bar-mode"

describe("deriveImageBarMode", () => {
  it("is 'edit' when the source is ready (photo present), even without a master", () => {
    expect(deriveImageBarMode({ sourceStatus: "ready", hasMaster: false })).toBe("edit")
  })

  it("is 'edit' when a master is present, even while the source is still loading (SSR seed)", () => {
    expect(deriveImageBarMode({ sourceStatus: "loading", hasMaster: true })).toBe("edit")
  })

  it("is 'pending' while the source is loading and there is no master (no Add flash)", () => {
    expect(deriveImageBarMode({ sourceStatus: "loading", hasMaster: false })).toBe("pending")
  })

  it("is 'add' only for a confirmed empty/error state with no master", () => {
    expect(deriveImageBarMode({ sourceStatus: "empty", hasMaster: false })).toBe("add")
    expect(deriveImageBarMode({ sourceStatus: "error", hasMaster: false })).toBe("add")
  })
})
