"use client"

/**
 * Loads `sourceImageUrl` into an `HTMLImageElement` and returns it
 * once `onload` fires, or `null` while loading / on URL-mismatch.
 *
 * `drawImage` accepts an `HTMLImageElement` directly with crop
 * parameters, so consumers don't need a scratch-canvas intermediate.
 *
 * Cancellation: an in-flight load is cancelled when the URL changes
 * or the consumer unmounts — the late `onload` callback then becomes
 * a no-op.
 */
import { useEffect, useState } from "react"

type LoadedImage = { url: string; img: HTMLImageElement }

export function useSourceImage(sourceImageUrl: string): HTMLImageElement | null {
  const [loaded, setLoaded] = useState<LoadedImage | null>(null)

  useEffect(() => {
    let cancelled = false
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      if (cancelled) return
      setLoaded({ url: sourceImageUrl, img })
    }
    img.onerror = () => {
      if (!cancelled) console.error("Failed to load preview source:", sourceImageUrl)
    }
    img.src = sourceImageUrl
    return () => {
      cancelled = true
    }
  }, [sourceImageUrl])

  // URL-gate: drop the stale image when the parent swaps the URL so
  // we don't briefly show the previous image's pixels.
  return loaded?.url === sourceImageUrl ? loaded.img : null
}
