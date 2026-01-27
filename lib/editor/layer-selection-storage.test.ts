import { describe, expect, test } from "vitest"

import { readSelectedLayerId, writeSelectedLayerId } from "./layer-selection-storage"

describe("layer-selection-storage", () => {
  test("read returns default when localStorage throws", () => {
    const orig = globalThis.window
    ;(globalThis as any).window = {
      localStorage: {
        getItem() {
          throw new Error("nope")
        },
      },
    }

    expect(readSelectedLayerId("p1")).toBe("artboard")

    ;(globalThis as any).window = orig
  })

  test("write sets v1 and legacy keys", () => {
    const store = new Map<string, string>()
    const orig = globalThis.window
    ;(globalThis as any).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    }

    writeSelectedLayerId("p1", "image:master")
    // v1
    expect(store.get("gruf:v1:editor:layers:selected:p1")).toBe("image:master")
    // legacy
    expect(store.get("gruf:editor:layers:selected:p1")).toBe("image:master")

    ;(globalThis as any).window = orig
  })

  test("read prefers v1 over legacy", () => {
    const store = new Map<string, string>([
      ["gruf:editor:layers:selected:p1", "legacy"],
      ["gruf:v1:editor:layers:selected:p1", "v1"],
    ])
    const orig = globalThis.window
    ;(globalThis as any).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    }

    expect(readSelectedLayerId("p1")).toBe("v1")

    ;(globalThis as any).window = orig
  })
})

