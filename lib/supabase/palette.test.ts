import { describe, expect, it } from "vitest"

import { makeMockSupabase } from "./__mocks__/make-mock-supabase"
import { readTracePalette } from "./palette"

const grayRow = {
  oklab_l: 0.3,
  oklab_a: 0,
  oklab_b: 0,
  rgb_r: 77,
  rgb_g: 77,
  rgb_b: 77,
}
const munsellRow = {
  oklab_l: 0.5,
  oklab_a: 0.1,
  oklab_b: -0.1,
  rgb_r: 128,
  rgb_g: 64,
  rgb_b: 64,
}

describe("readTracePalette", () => {
  it("bw reads lab_grays and maps rows to chips", async () => {
    const supabase = makeMockSupabase({ tables: { lab_grays: { select: { data: [grayRow] } } } })
    await expect(readTracePalette(supabase, "bw")).resolves.toEqual([
      { oklab: [0.3, 0, 0], rgb: [77, 77, 77] },
    ])
  })

  it("color reads lab_munsell and maps rows to chips", async () => {
    const supabase = makeMockSupabase({ tables: { lab_munsell: { select: { data: [munsellRow] } } } })
    await expect(readTracePalette(supabase, "color")).resolves.toEqual([
      { oklab: [0.5, 0.1, -0.1], rgb: [128, 64, 64] },
    ])
  })

  // The bw-mode 500 (`circulate_process`) root cause: an empty lab_grays makes
  // the accessor throw, which the trace server turns into a 500.
  it("throws when lab_grays is empty", async () => {
    const supabase = makeMockSupabase({ tables: { lab_grays: { select: { data: [] } } } })
    await expect(readTracePalette(supabase, "bw")).rejects.toThrow("Palette lab_grays is empty")
  })

  it("throws when lab_munsell is empty", async () => {
    const supabase = makeMockSupabase({ tables: { lab_munsell: { select: { data: [] } } } })
    await expect(readTracePalette(supabase, "color")).rejects.toThrow("Palette lab_munsell is empty")
  })

  it("throws with the table name on a DB error", async () => {
    const supabase = makeMockSupabase({ tables: { lab_grays: { select: { error: { message: "boom" } } } } })
    await expect(readTracePalette(supabase, "bw")).rejects.toThrow("Failed to read lab_grays palette: boom")
  })
})
