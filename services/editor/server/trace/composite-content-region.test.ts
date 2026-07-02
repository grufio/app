import sharp from "sharp"
import { describe, expect, it } from "vitest"

import { compositeContentRegion } from "./composite-content-region"
import { computeContentRegionPlan } from "@/lib/editor/trace/content-region"

async function solid(width: number, height: number, rgb: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: rgb } }).png().toBuffer()
}

async function pixelAt(buf: Buffer, x: number, y: number): Promise<[number, number, number]> {
  const { data, info } = await sharp(buf).ensureAlpha(0).raw().toBuffer({ resolveWithObject: true })
  const ch = info.channels
  const idx = (y * info.width + x) * ch
  return [data[idx], data[idx + 1], data[idx + 2]]
}

describe("compositeContentRegion (sharp)", () => {
  it("partial coverage: image in the middle, white around it", async () => {
    // content rect 100×100 (no padding). Red image 50×50 @ 25,25, intrinsic 50.
    const plan = computeContentRegionPlan({
      artboardWPx: 100,
      artboardHPx: 100,
      padding: { topPx: 0, bottomPx: 0, leftPx: 0, rightPx: 0 },
      image: { leftPx: 25, topPx: 25, widthPx: 50, heightPx: 50 },
      intrinsicWPx: 50,
      intrinsicHPx: 50,
    })
    if (!plan.ok) throw new Error("plan failed")

    const src = await solid(50, 50, { r: 255, g: 0, b: 0 })
    const out = await compositeContentRegion({ sourceBuffer: src, plan })

    const meta = await sharp(out).metadata()
    expect(meta.width).toBe(100)
    expect(meta.height).toBe(100)
    expect(await pixelAt(out, 50, 50)).toEqual([255, 0, 0]) // centre = image (red)
    expect(await pixelAt(out, 5, 5)).toEqual([255, 255, 255]) // corner = white
  })

  it("no coverage: all white", async () => {
    const plan = computeContentRegionPlan({
      artboardWPx: 100,
      artboardHPx: 100,
      padding: { topPx: 40, bottomPx: 40, leftPx: 40, rightPx: 40 },
      image: { leftPx: 0, topPx: 0, widthPx: 30, heightPx: 30 },
      intrinsicWPx: 30,
      intrinsicHPx: 30,
    })
    if (!plan.ok) throw new Error("plan failed")

    const src = await solid(30, 30, { r: 0, g: 0, b: 0 })
    const out = await compositeContentRegion({ sourceBuffer: src, plan })
    expect(await pixelAt(out, 10, 10)).toEqual([255, 255, 255])
  })
})
