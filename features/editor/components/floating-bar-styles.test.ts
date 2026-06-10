import { describe, expect, it } from "vitest"

import { circleClass, ICON_TONE, pillClass } from "./floating-bar-styles"

describe("floating-bar-styles", () => {
  it("pills flip surface + ring by tone, keep the variant padding", () => {
    const darkSingle = pillClass("dark", "single")
    expect(darkSingle).toContain("bg-zinc-900/95")
    expect(darkSingle).toContain("ring-white/10")
    expect(darkSingle).toContain("p-1")

    const lightGroup = pillClass("light", "group")
    expect(lightGroup).toContain("bg-white/95")
    expect(lightGroup).toContain("ring-zinc-900/10")
    expect(lightGroup).toContain("gap-3")
    expect(lightGroup).not.toContain("bg-zinc-900/95")
  })

  it("circles are round, tone-keyed ink + hover", () => {
    expect(circleClass("dark")).toContain("text-white")
    expect(circleClass("dark")).toContain("rounded-full")
    expect(circleClass("light")).toContain("text-zinc-900")
    expect(circleClass("light")).toContain("hover:bg-zinc-100")
  })

  it("light-theme ink is zinc-900 (the same black as the dark background)", () => {
    expect(ICON_TONE.light.active).toBe("text-zinc-900")
    expect(ICON_TONE.light.inactive).toBe("text-zinc-900/70")
    expect(ICON_TONE.dark.active).toBe("text-white")
  })
})
