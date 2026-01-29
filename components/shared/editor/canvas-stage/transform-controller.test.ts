import { describe, expect, it } from "vitest"

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
})

