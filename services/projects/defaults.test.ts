import { describe, expect, it } from "vitest"

import { DEFAULT_PROJECT_CREATE_INPUT } from "./defaults"

describe("DEFAULT_PROJECT_CREATE_INPUT", () => {
  it("is a valid, positive default artboard", () => {
    expect(["mm", "cm", "pt", "px"]).toContain(DEFAULT_PROJECT_CREATE_INPUT.unit)
    expect(DEFAULT_PROJECT_CREATE_INPUT.width_value).toBeGreaterThan(0)
    expect(DEFAULT_PROJECT_CREATE_INPUT.height_value).toBeGreaterThan(0)
    expect(DEFAULT_PROJECT_CREATE_INPUT.dpi).toBeGreaterThan(0)
    expect(DEFAULT_PROJECT_CREATE_INPUT.name.trim().length).toBeGreaterThan(0)
  })
})
