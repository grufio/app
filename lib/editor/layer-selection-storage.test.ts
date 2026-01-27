import { describe, expect, test } from "vitest"

import { readSelectedLayerId, writeSelectedLayerId } from "./layer-selection-storage"

type GlobalWithWindow = typeof globalThis & { window: unknown }

describe("layer-selection-storage", () => {
  test("read returns default when localStorage throws", () => {
    const g = globalThis as GlobalWithWindow
    const orig = g.window
    g.window = {
      localStorage: {
        getItem() {
          throw new Error("nope")
        },
      },
    }

    expect(readSelectedLayerId("p1")).toBe("artboard")

    g.window = orig
  })

  test("write sets v1 and legacy keys", () => {
    const store = new Map<string, string>()
    const g = globalThis as GlobalWithWindow
    const orig = g.window
    g.window = {
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

    g.window = orig
  })

  test("read prefers v1 over legacy", () => {
    const store = new Map<string, string>([
      ["gruf:editor:layers:selected:p1", "legacy"],
      ["gruf:v1:editor:layers:selected:p1", "v1"],
    ])
    const g = globalThis as GlobalWithWindow
    const orig = g.window
    g.window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    }

    expect(readSelectedLayerId("p1")).toBe("v1")

    g.window = orig
  })
})

