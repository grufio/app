import { describe, expect, it } from "vitest"

import { getStaticLineRenderProps } from "./line-rendering"

describe("getStaticLineRenderProps", () => {
  it("returns standardized non-interactive crisp line props", () => {
    expect(getStaticLineRenderProps(1)).toEqual({
      strokeWidth: 1,
      strokeScaleEnabled: false,
      listening: false,
      perfectDrawEnabled: false,
      hitStrokeWidth: 0,
    })
  })
})
