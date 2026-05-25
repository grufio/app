import { describe, expect, it } from "vitest"

import {
  DEFAULT_INNER_FILTER,
  INNER_FILTERS,
  INNER_FILTER_IDS,
  resolveInnerFilter,
} from "./inner-color-filters"

describe("inner colour filters", () => {
  it("the id tuple matches the preset table", () => {
    expect(INNER_FILTER_IDS).toEqual(INNER_FILTERS.map((f) => f.id))
  })

  it("the default filter exists in the table", () => {
    expect(INNER_FILTERS.some((f) => f.id === DEFAULT_INNER_FILTER)).toBe(true)
  })

  it("'none' is the identity adjustment", () => {
    expect(resolveInnerFilter("none")).toEqual({ hueDeg: 0, lightnessDelta: 0, chromaScale: 1 })
  })

  it("'darker' lowers lightness (works on greys too)", () => {
    expect(resolveInnerFilter("darker").lightnessDelta).toBeLessThan(0)
  })

  it("'complement' rotates the hue 180°", () => {
    expect(resolveInnerFilter("complement").hueDeg).toBe(180)
  })

  it("an unknown id resolves to the identity (safe fallback)", () => {
    expect(resolveInnerFilter("does-not-exist")).toEqual({ hueDeg: 0, lightnessDelta: 0, chromaScale: 1 })
  })
})
