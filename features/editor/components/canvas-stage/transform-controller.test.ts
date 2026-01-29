/**
 * Unit tests for `transform-controller`.
 *
 * Focus:
 * - Immediate commit behavior for explicit size changes.
 */
import { describe, expect, it, vi } from "vitest"
import type Konva from "konva"

import { createTransformController } from "./transform-controller"

describe("createTransformController", () => {
  it("setImageSize commits immediately even without node", () => {
    const commits: Array<{ widthPxU: bigint; heightPxU: bigint }> = []
    let rot = 0
    let tx: { xPxU: bigint; yPxU: bigint; widthPxU: bigint; heightPxU: bigint } | null = null
    const c = createTransformController({
      getImageNode: () => null,
      getLayer: () => null,
      getRotationDeg: () => rot,
      setRotationDeg: (d) => {
        rot = d
      },
      getImageTx: () => tx,
      setImageTx: (n) => {
        tx = n
      },
      markUserChanged: () => {},
      onCommit: (t) => commits.push({ widthPxU: t.widthPxU, heightPxU: t.heightPxU }),
    })

    c.setImageSize(2_000_000n, 3_000_000n, { x: 10, y: 20 })
    expect(commits.length).toBe(1)
    expect(commits[0].widthPxU).toBe(2_000_000n)
    expect(commits[0].heightPxU).toBe(3_000_000n)
  })

  it("scheduleCommit merges commitPosition flags", async () => {
    vi.useFakeTimers()
    try {
      const commits: Array<{ xPxU?: bigint; yPxU?: bigint }> = []
      let rot = 0
      let tx: { xPxU: bigint; yPxU: bigint; widthPxU: bigint; heightPxU: bigint } | null = {
        xPxU: 111n,
        yPxU: 222n,
        widthPxU: 3_000_000n,
        heightPxU: 4_000_000n,
      }
      const nodeStub = {
        // bakeInSizeToMicroPx reads width/height via Konva-like accessors.
        width: () => 3,
        height: () => 4,
        scaleX: () => 1,
        scaleY: () => 1,
        x: () => 10,
        y: () => 20,
        rotation: () => 0,
      } as unknown as Konva.Image
      const c = createTransformController({
        // No node: commitFromNode will no-op, but rotate90/setImageSize tests cover commits.
        // For this test we only verify the flag merge by observing whether commitFromNode is called
        // with `commitPosition=true` via a minimal node stub.
        getImageNode: () => nodeStub,
        getLayer: () => null,
        getRotationDeg: () => rot,
        setRotationDeg: (d) => {
          rot = d
        },
        getImageTx: () => tx,
        setImageTx: (n) => {
          tx = n
        },
        markUserChanged: () => {},
        onCommit: (t) => commits.push({ xPxU: t.xPxU, yPxU: t.yPxU }),
      })

      c.scheduleCommit(false, 10)
      c.scheduleCommit(true, 10)
      await vi.advanceTimersByTimeAsync(20)

      expect(commits.length).toBe(1)
      // If commitPosition was merged to true, x/y are included.
      expect(typeof commits[0].xPxU).toBe("bigint")
      expect(typeof commits[0].yPxU).toBe("bigint")
    } finally {
      vi.useRealTimers()
    }
  })
})

