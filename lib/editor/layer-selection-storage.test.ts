/**
 * Unit tests for `lib/editor/layer-selection-storage.ts`.
 *
 * Focus:
 * - LocalStorage read/write behavior.
 */
import { describe, expect, test } from "vitest"

import { readSelectedLayerId, writeSelectedLayerId } from "./layer-selection-storage"

type GlobalWithWindow = { window: unknown }

describe("layer-selection-storage", () => {
  test("read returns default when localStorage throws", () => {
    const g = globalThis as unknown as GlobalWithWindow
    const orig = g.window
    g.window = {
      localStorage: {
        getItem() {
          throw new Error("nope")
        },
      } as unknown as Storage,
    }

    expect(readSelectedLayerId("p1")).toBe("artboard")

    g.window = orig
  })

  test("write persists under the v1 key", () => {
    const store = new Map<string, string>()
    const g = globalThis as unknown as GlobalWithWindow
    const orig = g.window
    g.window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      } as unknown as Storage,
    }

    writeSelectedLayerId("p1", "image:master")
    expect(store.get("gruf:v1:editor:layers:selected:p1")).toBe("image:master")

    g.window = orig
  })

  test("read returns the value previously written under the v1 key", () => {
    const store = new Map<string, string>([
      ["gruf:v1:editor:layers:selected:p1", "image:master"],
    ])
    const g = globalThis as unknown as GlobalWithWindow
    const orig = g.window
    g.window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      } as unknown as Storage,
    }

    expect(readSelectedLayerId("p1")).toBe("image:master")

    g.window = orig
  })
})
