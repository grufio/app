"use client"

/**
 * Fetch the raw SVG text from a signed storage URL.
 *
 * Used by `trace-interactive-overlay` to render an inline DOM SVG
 * on top of the Konva-rasterised trace image — only the inline
 * form gives us per-path hover/click hit detection. Returns `null`
 * for non-SVG content (the response's content-type filter prevents
 * accidentally treating a JPEG/PNG as parseable markup) or when
 * the fetch fails for any reason; callers fall back to showing
 * the Konva.Image alone.
 */
import { useEffect, useState } from "react"

export function useSvgText(src: string | null): string | null {
  const [text, setText] = useState<string | null>(null)

  useEffect(() => {
    if (!src) {
      setText(null)
      return
    }
    let cancelled = false
    fetch(src)
      .then(async (r) => {
        if (!r.ok) return null
        const ct = r.headers.get("content-type") ?? ""
        if (!ct.includes("svg")) return null
        return r.text()
      })
      .then((t) => {
        if (cancelled) return
        setText(t)
      })
      .catch(() => {
        if (cancelled) return
        setText(null)
      })
    return () => {
      cancelled = true
    }
  }, [src])

  return text
}
