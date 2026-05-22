import { describe, expect, it } from "vitest"

import { PROJECT_PRESETS, getProjectPresetById, getProjectPresetsByGroup } from "./presets"

describe("project presets", () => {
  it("looks up a preset by id", () => {
    expect(getProjectPresetById("print-a4")).toMatchObject({ id: "print-a4", unit: "mm", width_value: 210, height_value: 297 })
  })

  it("returns null for an unknown id", () => {
    expect(getProjectPresetById("nope")).toBeNull()
  })

  it("filters presets by group", () => {
    const print = getProjectPresetsByGroup("print")
    const web = getProjectPresetsByGroup("web")
    expect(print.every((p) => p.group === "print")).toBe(true)
    expect(web.every((p) => p.group === "web")).toBe(true)
    expect(print.length + web.length).toBe(PROJECT_PRESETS.length)
  })

  it("has unique ids and positive dimensions", () => {
    const ids = PROJECT_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const p of PROJECT_PRESETS) {
      expect(p.width_value).toBeGreaterThan(0)
      expect(p.height_value).toBeGreaterThan(0)
      expect(["print", "web"]).toContain(p.group)
    }
  })
})
