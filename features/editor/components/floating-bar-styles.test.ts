import { describe, expect, it } from "vitest"

import { circleClass, frameClass, ICON_TONE, pillClass } from "./floating-bar-styles"

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

  it("defaults to the active variant", () => {
    expect(circleClass("dark")).toBe(circleClass("dark", "active"))
    expect(circleClass("dark", "active")).toContain("hover:bg-zinc-800")
    expect(circleClass("dark", "active")).toContain("bg-zinc-900/95")
  })

  it("frames are rounded-rect (not circles) but share the chip surface", () => {
    const darkFrame = frameClass("dark")
    expect(darkFrame).toContain("rounded-lg")
    expect(darkFrame).not.toContain("rounded-full")
    expect(darkFrame).toContain("bg-zinc-900/95")
    expect(darkFrame).toContain("size-10")
    // active frame is interactive (hover), inactive dims + drops hover
    expect(darkFrame).toContain("hover:bg-zinc-800")
    const lightInactiveFrame = frameClass("light", "inactive")
    expect(lightInactiveFrame).toContain("rounded-lg")
    expect(lightInactiveFrame).toContain("bg-zinc-200/90")
    expect(lightInactiveFrame).toContain("text-zinc-900/40")
    expect(lightInactiveFrame).not.toContain("hover:")
  })

  it("inactive variant dims surface + ink per tone and drops hover", () => {
    const darkInactive = circleClass("dark", "inactive")
    expect(darkInactive).toContain("bg-zinc-800")
    expect(darkInactive).toContain("text-white/40")
    expect(darkInactive).not.toContain("hover:")
    expect(darkInactive).not.toContain("bg-zinc-900/95")
    // chrome preserved
    expect(darkInactive).toContain("rounded-full")
    expect(darkInactive).toContain("size-10")

    const lightInactive = circleClass("light", "inactive")
    expect(lightInactive).toContain("bg-zinc-200/90")
    expect(lightInactive).toContain("text-zinc-900/40")
    expect(lightInactive).not.toContain("hover:")
    expect(lightInactive).not.toContain("bg-white/95")
  })

  it("light-theme ink is zinc-900 (the same black as the dark background)", () => {
    expect(ICON_TONE.light.active).toBe("text-zinc-900")
    expect(ICON_TONE.light.inactive).toBe("text-zinc-900/70")
    expect(ICON_TONE.dark.active).toBe("text-white")
  })
})
