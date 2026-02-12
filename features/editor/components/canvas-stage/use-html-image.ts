"use client"

/**
 * HTML image loader hook.
 *
 * Responsibilities:
 * - Load an `HTMLImageElement` for a given URL and keep it in React state.
 * - Ensure cross-origin is set for canvas usage.
 */
import { useEffect, useState } from "react"

export function useHtmlImage(src: string | null) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    if (!src) return
    const i = new window.Image()
    i.crossOrigin = "anonymous"
    i.onload = () => setImg(i)
    i.onerror = () => setImg(null)
    i.src = src
    return () => {
      i.onload = null
      i.onerror = null
      setImg(null)
    }
  }, [src])

  return img
}

