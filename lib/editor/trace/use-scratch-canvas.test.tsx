/**
 * @vitest-environment jsdom
 *
 * Hook test for `useScratchCanvas`.
 *
 * jsdom has no functioning 2D canvas context, so `buildScratchCanvas`
 * is mocked — we test the *Hook* contract (load + URL-gate +
 * cancellation), not the canvas building itself.
 */
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./pixelate-preview", () => ({
  buildScratchCanvas: (img: HTMLImageElement) => {
    const c = document.createElement("canvas")
    // Encode the source URL into the canvas via a custom attribute so
    // tests can verify which load produced which canvas.
    c.setAttribute("data-source-url", img.src)
    c.width = 100
    c.height = 75
    return c
  },
}))

import { useScratchCanvas } from "./use-scratch-canvas"

class FakeImage {
  src = ""
  crossOrigin: string | null = null
  naturalWidth = 100
  naturalHeight = 75
  private _onload: (() => void) | null = null
  set onload(fn: (() => void) | null) {
    this._onload = fn
    // Defer to microtask so callers set `src` before `onload` fires.
    if (fn) queueMicrotask(() => this._onload?.())
  }
  get onload(): (() => void) | null {
    return this._onload
  }
  onerror: (() => void) | null = null
}

const flushMicrotasks = () => new Promise<void>((resolve) => queueMicrotask(resolve))

describe("useScratchCanvas", () => {
  beforeEach(() => {
    vi.stubGlobal("Image", FakeImage)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("returns null before the image finishes loading", () => {
    const { result } = renderHook(() => useScratchCanvas("https://example.test/a.png", 1000))
    expect(result.current).toBeNull()
  })

  it("resolves to a canvas after the image loads", async () => {
    const { result } = renderHook(() => useScratchCanvas("https://example.test/a.png", 1000))
    await act(async () => {
      await flushMicrotasks()
    })
    expect(result.current).not.toBeNull()
    expect(result.current?.getAttribute("data-source-url")).toBe("https://example.test/a.png")
  })

  it("returns null again immediately when the URL changes (URL-gate)", async () => {
    const { result, rerender } = renderHook(({ url }) => useScratchCanvas(url, 1000), {
      initialProps: { url: "https://example.test/a.png" },
    })
    await act(async () => {
      await flushMicrotasks()
    })
    expect(result.current?.getAttribute("data-source-url")).toBe("https://example.test/a.png")

    rerender({ url: "https://example.test/b.png" })
    // After the URL changes, the stale scratch is gated out — null
    // until the new image finishes loading.
    expect(result.current).toBeNull()

    await act(async () => {
      await flushMicrotasks()
    })
    expect(result.current?.getAttribute("data-source-url")).toBe("https://example.test/b.png")
  })
})
