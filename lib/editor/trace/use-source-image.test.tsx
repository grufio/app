/**
 * @vitest-environment jsdom
 *
 * Hook test for `useSourceImage`. Asserts the contract:
 *   - returns null before the image's `onload` fires
 *   - returns the HTMLImageElement after onload
 *   - the URL-gate drops the stale image when the parent swaps URL
 */
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FakeImage } from "@/lib/test/jsdom-stubs"
import { useSourceImage } from "./use-source-image"

const flushMicrotasks = () => new Promise<void>((resolve) => queueMicrotask(resolve))

describe("useSourceImage", () => {
  beforeEach(() => {
    vi.stubGlobal("Image", FakeImage)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("returns null before the image finishes loading", () => {
    const { result } = renderHook(() => useSourceImage("https://example.test/a.png"))
    expect(result.current).toBeNull()
  })

  it("resolves to the HTMLImageElement after onload", async () => {
    const { result } = renderHook(() => useSourceImage("https://example.test/a.png"))
    await act(async () => {
      await flushMicrotasks()
    })
    expect(result.current).not.toBeNull()
    expect(result.current?.src).toBe("https://example.test/a.png")
  })

  it("returns null again when the URL changes (URL-gate)", async () => {
    const { result, rerender } = renderHook(({ url }) => useSourceImage(url), {
      initialProps: { url: "https://example.test/a.png" },
    })
    await act(async () => {
      await flushMicrotasks()
    })
    expect(result.current?.src).toBe("https://example.test/a.png")

    rerender({ url: "https://example.test/b.png" })
    // URL-gate kicks in immediately on prop change.
    expect(result.current).toBeNull()

    await act(async () => {
      await flushMicrotasks()
    })
    expect(result.current?.src).toBe("https://example.test/b.png")
  })
})
