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

  // Fetch-on-src-change. The setText calls reflect a real async
  // result (or the src going null), not a derived value from props
  // — `useSyncExternalStore` (the rule's recommendation) is for
  // subscriptions, not one-shot fetches. A Suspense + `use()`
  // refactor would be the cleaner long-term path but requires a
  // Suspense boundary in project-canvas-stage; deferred until the
  // overlay graduates to a resource loader.
  useEffect(() => {
    if (!src) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setText(null)
      return
    }
    let cancelled = false
    fetch(src)
      .then(async (r) => {
        if (!r.ok) return null
        const ct = r.headers.get("content-type") ?? ""
        // Header check covers well-behaved storage backends. The body
        // sniff handles Supabase signed URLs that occasionally serve
        // SVG with `application/octet-stream` (the upload set the
        // content-type but the signed URL flavour can drop it).
        if (ct.includes("svg")) return r.text()
        const sample = await r.text()
        const head = sample.trimStart().slice(0, 256).toLowerCase()
        if (head.startsWith("<?xml") || head.startsWith("<svg") || head.includes("<svg")) {
          return sample
        }
        return null
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
