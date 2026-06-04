"use client"

/**
 * Loads the trace Munsell palettes from `/api/palette` and returns the chips
 * for the requested mode (`color` → active tier of the 512-chip palette, default
 * 128; `bw` → 48). The palette is static per session, so the response is cached
 * module-wide and shared across all
 * previews — one fetch per session. Returns `null` until loaded; callers fall
 * back to raw means meanwhile.
 */
import { useEffect, useState } from "react"

import type { PaletteChip } from "./trace-cell-colors"

type PaletteResponse = { color: PaletteChip[]; bw: PaletteChip[] }

let cache: PaletteResponse | null = null
let inflight: Promise<PaletteResponse | null> | null = null

async function loadPalette(): Promise<PaletteResponse | null> {
  if (cache) return cache
  if (!inflight) {
    inflight = fetch("/api/palette", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { ok?: boolean; color?: PaletteChip[]; bw?: PaletteChip[] } | null) => {
        if (!json?.ok || !json.color || !json.bw) return null
        cache = { color: json.color, bw: json.bw }
        return cache
      })
      .catch(() => null)
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

export function useTracePalette(mode: "color" | "bw"): PaletteChip[] | null {
  const [data, setData] = useState<PaletteResponse | null>(cache)
  useEffect(() => {
    if (data) return
    let cancelled = false
    void loadPalette().then((p) => {
      if (!cancelled && p) setData(p)
    })
    return () => {
      cancelled = true
    }
  }, [data])
  return data ? data[mode] : null
}
