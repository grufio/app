import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { smoothnessToVtracerParams } from "./lineart"

describe("smoothnessToVtracerParams", () => {
  it("mirrors the server's smoothness → corner/length/speckle mapping", () => {
    // Same three lines as filter-service/app/lineart.py::lineart_to_svg.
    expect(smoothnessToVtracerParams(0)).toEqual({
      cornerThreshold: 180,
      lengthThreshold: 0,
      filterSpeckle: 16,
    })
    expect(smoothnessToVtracerParams(1)).toEqual({
      cornerThreshold: 60,
      lengthThreshold: 8,
      filterSpeckle: 32,
    })
    // Default dial (0.6): corner 108, length 4.8, speckle 19.
    expect(smoothnessToVtracerParams(0.6)).toEqual({
      cornerThreshold: 108,
      lengthThreshold: 4.8,
      filterSpeckle: 19,
    })
  })

  it("clamps out-of-range smoothness to [0, 1]", () => {
    expect(smoothnessToVtracerParams(-1)).toEqual(smoothnessToVtracerParams(0))
    expect(smoothnessToVtracerParams(2)).toEqual(smoothnessToVtracerParams(1))
  })
})

describe("public wasm binary", () => {
  // Guard against silent desync: `public/wasm/wasm_vtracer_bg.wasm` is a copy
  // of the pinned npm package's binary (the loader fetches the public copy but
  // imports the package's JS glue). If a dependency bump changes the binary
  // without re-copying, the glue and the served wasm diverge → runtime break.
  // This fails the build the moment they differ.
  it("is byte-identical to the pinned wasm_vtracer package binary", () => {
    const served = readFileSync(
      fileURLToPath(new URL("../../../public/wasm/wasm_vtracer_bg.wasm", import.meta.url)),
    )
    const pkg = readFileSync(
      fileURLToPath(
        new URL("../../../node_modules/wasm_vtracer/wasm_vtracer_bg.wasm", import.meta.url),
      ),
    )
    expect(served.equals(pkg)).toBe(true)
  })
})
