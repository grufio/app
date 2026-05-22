import { describe, expect, it } from "vitest"

import { guessImageFormat } from "./format-detection"

// guessImageFormat only reads `type` and `name`, so a structural stub
// keeps the test runnable in the default node environment.
const f = (type: string, name: string) => ({ type, name }) as unknown as File

describe("guessImageFormat", () => {
  it("maps known MIME types", () => {
    expect(guessImageFormat(f("image/jpeg", "x"))).toBe("jpeg")
    expect(guessImageFormat(f("image/png", "x"))).toBe("png")
    expect(guessImageFormat(f("image/webp", "x"))).toBe("webp")
    expect(guessImageFormat(f("image/gif", "x"))).toBe("gif")
    expect(guessImageFormat(f("image/svg+xml", "x"))).toBe("svg")
  })

  it("lowercases the MIME before matching", () => {
    expect(guessImageFormat(f("IMAGE/PNG", "x"))).toBe("png")
  })

  it("prefers MIME over the file extension", () => {
    expect(guessImageFormat(f("image/png", "photo.jpg"))).toBe("png")
  })

  it("falls back to the extension when MIME is empty/unknown", () => {
    expect(guessImageFormat(f("", "photo.JPG"))).toBe("jpeg")
    expect(guessImageFormat(f("", "drawing.bmp"))).toBe("bmp")
    expect(guessImageFormat(f("application/octet-stream", "art.tiff"))).toBe("tiff")
  })

  it("returns 'unknown' when there is no usable MIME or extension", () => {
    expect(guessImageFormat(f("", ""))).toBe("unknown")
    expect(guessImageFormat(f("", "trailingdot."))).toBe("unknown")
  })
})
