"use client"

/**
 * Fetches the shared blue-noise threshold LUT (`/assets/blue-noise-256.bin`)
 * for the trace texture filter and returns the cached `Uint8Array`. Returns
 * `null` until the fetch resolves — callers skip the texture step meanwhile
 * (the snapped output ships unchanged). One fetch per session via
 * {@link loadBlueNoiseLut}'s module-level cache; subsequent dialog opens are
 * free.
 *
 * The same binary is loaded server-side by `filter-service/app/cell_texture.py`
 * so client preview and applied SVG agree byte-for-byte once both inputs
 * (palette + LUT) are available.
 */
import { useEffect, useState } from "react"

import { loadBlueNoiseLut } from "./cell-texture"

export function useBlueNoiseLut(): Uint8Array | null {
  const [lut, setLut] = useState<Uint8Array | null>(null)
  useEffect(() => {
    let cancelled = false
    void loadBlueNoiseLut()
      .then((u8) => {
        if (!cancelled) setLut(u8)
      })
      .catch(() => {
        // Swallow — texture is best-effort in the preview. The applied SVG
        // still runs through the server which has the LUT bundled.
      })
    return () => {
      cancelled = true
    }
  }, [])
  return lut
}
