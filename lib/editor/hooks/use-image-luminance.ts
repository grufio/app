"use client"

/**
 * Average perceived lightness (OKLab `L`, 0..1) of the image at `imageUrl`,
 * or `null` while loading / when there is no URL / on error (e.g. a CORS
 * failure). Used to auto-pick the floating bars' tone from the displayed
 * image's brightness.
 *
 * Samples a downscaled copy (≤32px edge) for cheap reads, recomputed only
 * when the URL changes. The loader mirrors `use-source-image.ts`
 * (`crossOrigin="anonymous"`, the proven CORS-safe path for Supabase signed
 * URLs that the trace preview already reads pixels from) but is inlined so
 * a null URL never triggers a failed-load. The mean RGB → OKLab math reuses
 * `cellAreaAverages` + `rgb255ToOklab`.
 */
import { useEffect, useState } from "react"

import { rgb255ToOklab } from "@/lib/color/oklab"
import { cellAreaAverages } from "@/lib/editor/trace/trace-cell-colors"

const SAMPLE_EDGE = 32

type Computed = { url: string; luminance: number }

export function useImageLuminance(imageUrl: string | null): number | null {
  // URL-gated like `use-source-image`: setState happens only in the async
  // onload callback (allowed — external state arriving), and the gate at the
  // bottom returns null for a null/stale/failed URL without a synchronous
  // setState in the effect body.
  const [computed, setComputed] = useState<Computed | null>(null)

  useEffect(() => {
    if (!imageUrl) return
    let cancelled = false
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      if (cancelled) return
      try {
        const w = Math.max(1, Math.min(SAMPLE_EDGE, img.naturalWidth || SAMPLE_EDGE))
        const h = Math.max(1, Math.min(SAMPLE_EDGE, img.naturalHeight || SAMPLE_EDGE))
        const canvas = document.createElement("canvas")
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext("2d", { willReadFrequently: true })
        if (!ctx) return
        ctx.drawImage(img, 0, 0, w, h)
        const { data } = ctx.getImageData(0, 0, w, h)
        const { r, g, b } = cellAreaAverages({
          rgba: data,
          width: w,
          height: h,
          cellsX: 1,
          cellsY: 1,
        })
        const [L] = rgb255ToOklab(r[0], g[0], b[0])
        if (!cancelled) setComputed({ url: imageUrl, luminance: L })
      } catch {
        // Tainted canvas / read failure → leave the prior value; the
        // url-gate below returns null because it won't match this url.
      }
    }
    img.onerror = () => {
      /* no-op: url-gate returns null while this url has no computed value */
    }
    img.src = imageUrl
    return () => {
      cancelled = true
    }
  }, [imageUrl])

  return computed?.url === imageUrl ? computed.luminance : null
}
