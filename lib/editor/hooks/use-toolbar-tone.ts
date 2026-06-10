"use client"

/**
 * Derives the floating-bar tone from a perceived-lightness value with
 * hysteresis: a bright surface → dark bars; a dark surface → light bars.
 * The deadband (0.45 / 0.55) keeps mid-tone images from flickering between
 * themes. While `luminance` is null (image still decoding) the current tone
 * is held; the initial tone is "dark".
 */
import { useEffect, useState } from "react"

import { rgb255ToOklab } from "@/lib/color/oklab"
import type { ToolbarTone } from "@/features/editor/components/editor-toolbar-tone"

const FLIP_TO_LIGHT = 0.45
const FLIP_TO_DARK = 0.55

export function useToolbarTone(luminance: number | null): ToolbarTone {
  const [tone, setTone] = useState<ToolbarTone>("dark")
  useEffect(() => {
    if (luminance == null) return
    // Hysteresis is history-dependent (needs the previous tone), so the
    // tone genuinely lives in state and updates as luminance crosses the
    // deadband — not a synchronous derived value.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTone((prev) =>
      prev === "dark"
        ? luminance < FLIP_TO_LIGHT
          ? "light"
          : "dark"
        : luminance > FLIP_TO_DARK
          ? "dark"
          : "light",
    )
  }, [luminance])
  return tone
}

/** Perceived lightness (OKLab L, 0..1) of a `#rrggbb` hex colour, or null
 * if it can't be parsed. The no-image fallback (page background). */
export function hexLuminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  const [L] = rgb255ToOklab((n >> 16) & 255, (n >> 8) & 255, n & 255)
  return L
}
