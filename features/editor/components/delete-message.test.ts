/**
 * Unit tests for `buildDeleteMessage`. Covers the four user-visible
 * variants + pluralisation edges.
 */
import { describe, expect, it } from "vitest"

import { buildDeleteMessage } from "./delete-message"

describe("buildDeleteMessage", () => {
  it("no filters, no trace → 'empty the project' variant", () => {
    expect(buildDeleteMessage({ cascadeFilterCount: 0, cascadeHasTrace: false })).toBe(
      "This will permanently delete the image and empty the project.",
    )
  })

  it("one filter, no trace → singular 'filter'", () => {
    expect(buildDeleteMessage({ cascadeFilterCount: 1, cascadeHasTrace: false })).toBe(
      "This will permanently delete the image, 1 filter.",
    )
  })

  it("multiple filters, no trace → plural 'filters'", () => {
    expect(buildDeleteMessage({ cascadeFilterCount: 3, cascadeHasTrace: false })).toBe(
      "This will permanently delete the image, 3 filters.",
    )
  })

  it("trace only, no filters → 'and the trace overlay'", () => {
    expect(buildDeleteMessage({ cascadeFilterCount: 0, cascadeHasTrace: true })).toBe(
      "This will permanently delete the image, the trace overlay.",
    )
  })

  it("filters + trace → both parts joined with 'and'", () => {
    expect(buildDeleteMessage({ cascadeFilterCount: 2, cascadeHasTrace: true })).toBe(
      "This will permanently delete the image, 2 filters and the trace overlay.",
    )
  })

  it("single filter + trace → singular 'filter' plus trace", () => {
    expect(buildDeleteMessage({ cascadeFilterCount: 1, cascadeHasTrace: true })).toBe(
      "This will permanently delete the image, 1 filter and the trace overlay.",
    )
  })
})
