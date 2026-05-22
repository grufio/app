/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import { getImageDimensions } from "./dimensions"

const FILE = new Blob(["x"]) as unknown as File

class FakeImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  naturalWidth: number
  naturalHeight: number
  constructor(w = 200, h = 100) {
    this.naturalWidth = w
    this.naturalHeight = h
  }
  set src(_v: string) {
    queueMicrotask(() => this.onload?.())
  }
}

afterEach(() => vi.unstubAllGlobals())

describe("getImageDimensions", () => {
  it("uses createImageBitmap when available and releases the bitmap", async () => {
    const close = vi.fn()
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 120, height: 80, close })))
    expect(await getImageDimensions(FILE)).toEqual({ width: 120, height: 80 })
    expect(close).toHaveBeenCalledOnce()
  })

  it("falls back to <img> decode when createImageBitmap rejects, and revokes the object URL", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => {
      throw new Error("unsupported")
    }))
    const revokeObjectURL = vi.fn()
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL })
    vi.stubGlobal("Image", FakeImage)

    expect(await getImageDimensions(FILE)).toEqual({ width: 200, height: 100 })
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:x")
  })

  it("falls back to <img> decode when createImageBitmap is unavailable", async () => {
    vi.stubGlobal("createImageBitmap", undefined)
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:y"), revokeObjectURL: vi.fn() })
    vi.stubGlobal("Image", FakeImage)

    expect(await getImageDimensions(FILE)).toEqual({ width: 200, height: 100 })
  })
})
