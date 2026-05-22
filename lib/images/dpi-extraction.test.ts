import { afterEach, describe, expect, it, vi } from "vitest"

import exifr from "exifr/dist/lite.esm.mjs"
import { extractImageDPI } from "./dpi-extraction"

vi.mock("exifr/dist/lite.esm.mjs", () => ({ default: { parse: vi.fn() } }))

const parse = exifr.parse as unknown as ReturnType<typeof vi.fn>
const FILE = {} as File

afterEach(() => vi.clearAllMocks())

describe("extractImageDPI", () => {
  it("reads inch-unit EXIF resolution directly (rounded)", async () => {
    parse.mockResolvedValue({ XResolution: 299.6, YResolution: 300.4, ResolutionUnit: 2 })
    expect(await extractImageDPI(FILE)).toEqual({ dpiX: 300, dpiY: 300, source: "exif" })
  })

  it("converts cm-unit resolution to inches (×2.54)", async () => {
    parse.mockResolvedValue({ XResolution: 100, YResolution: 100, ResolutionUnit: 3 })
    expect(await extractImageDPI(FILE)).toEqual({ dpiX: 254, dpiY: 254, source: "exif" })
  })

  it("falls back to 72 when EXIF is absent", async () => {
    parse.mockResolvedValue(null)
    expect(await extractImageDPI(FILE)).toEqual({ dpiX: 72, dpiY: 72, source: "fallback" })
  })

  it("falls back when the resolution unit is unrecognised", async () => {
    parse.mockResolvedValue({ XResolution: 300, YResolution: 300, ResolutionUnit: 1 })
    expect(await extractImageDPI(FILE)).toEqual({ dpiX: 72, dpiY: 72, source: "fallback" })
  })

  it("falls back when resolution values are not numbers", async () => {
    parse.mockResolvedValue({ XResolution: "300", YResolution: "300", ResolutionUnit: 2 })
    expect(await extractImageDPI(FILE)).toEqual({ dpiX: 72, dpiY: 72, source: "fallback" })
  })

  it("falls back when parsing throws", async () => {
    parse.mockRejectedValue(new Error("corrupt"))
    expect(await extractImageDPI(FILE)).toEqual({ dpiX: 72, dpiY: 72, source: "fallback" })
  })
})
