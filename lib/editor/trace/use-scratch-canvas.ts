"use client"

/**
 * Loads `sourceImageUrl` and downsamples it to a ≤maxEdge scratch
 * canvas (via `buildScratchCanvas`). Returns the resulting canvas
 * once ready, or `null` while loading / on URL-mismatch.
 *
 * Cancellation: an in-flight load is cancelled when the URL changes
 * or the consumer unmounts — the late `onload` callback then becomes
 * a no-op.
 */
import { useEffect, useState } from "react"

import { buildScratchCanvas } from "./pixelate-preview"

type ScratchData = { url: string; canvas: HTMLCanvasElement }

export function useScratchCanvas(sourceImageUrl: string, maxEdge: number): HTMLCanvasElement | null {
  const [data, setData] = useState<ScratchData | null>(null)

  useEffect(() => {
    let cancelled = false
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      if (cancelled) return
      setData({ url: sourceImageUrl, canvas: buildScratchCanvas(img, maxEdge) })
    }
    img.onerror = () => {
      if (!cancelled) console.error("Failed to load preview source:", sourceImageUrl)
    }
    img.src = sourceImageUrl
    return () => {
      cancelled = true
    }
  }, [sourceImageUrl, maxEdge])

  // URL-gate: drop stale scratches whose URL no longer matches the
  // current prop. Avoids briefly showing the previous image's pixels
  // when the parent swaps `sourceImageUrl`.
  return data?.url === sourceImageUrl ? data.canvas : null
}
