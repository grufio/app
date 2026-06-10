/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { hexLuminance, useToolbarTone } from "./use-toolbar-tone"

function ToneProbe({ L }: { L: number | null }) {
  const tone = useToolbarTone(L)
  return <span data-testid="tone">{tone}</span>
}

describe("hexLuminance", () => {
  it("maps black → 0 and white → 1", () => {
    expect(hexLuminance("#000000")).toBeCloseTo(0, 5)
    expect(hexLuminance("#ffffff")).toBeCloseTo(1, 3)
  })

  it("accepts hex without the leading #", () => {
    expect(hexLuminance("ffffff")).toBeCloseTo(1, 3)
  })

  it("returns null for an unparseable colour", () => {
    expect(hexLuminance("not-a-hex")).toBeNull()
    expect(hexLuminance("#fff")).toBeNull()
  })
})

describe("useToolbarTone", () => {
  afterEach(() => cleanup())

  it("defaults to dark and applies the contrast + hysteresis rule", () => {
    const { getByTestId, rerender } = render(<ToneProbe L={null} />)
    const tone = () => getByTestId("tone").textContent

    expect(tone()).toBe("dark") // no luminance yet

    rerender(<ToneProbe L={0.9} />)
    expect(tone()).toBe("dark") // bright image → dark bars

    rerender(<ToneProbe L={0.4} />)
    expect(tone()).toBe("light") // dark/mid image → light bars

    rerender(<ToneProbe L={0.62} />)
    expect(tone()).toBe("light") // inside the deadband (0.6–0.68) → holds light

    rerender(<ToneProbe L={0.75} />)
    expect(tone()).toBe("dark") // above 0.68 → flips back to dark
  })
})
