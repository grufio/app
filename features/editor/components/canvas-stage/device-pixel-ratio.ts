"use client"

/**
 * Device-pixel-ratio helpers for crisp canvas hairlines.
 *
 * The Konva layer canvas renders at `window.devicePixelRatio` (verified: on a
 * 2× display the layer's backing store is 2× the CSS size). So a Konva
 * `strokeWidth` of 1 is 1 CSS px = `dpr` device px. To draw a true
 * 1-physical-pixel hairline, pass `strokeWidth = 1 / dpr`.
 */
import { useEffect, useState } from "react"

/** SSR-safe `window.devicePixelRatio`, floored at 1. */
export function getDevicePixelRatio(): number {
  if (typeof window === "undefined" || !Number.isFinite(Number(window.devicePixelRatio))) return 1
  return Math.max(1, Number(window.devicePixelRatio))
}

/**
 * Reactive device pixel ratio — re-renders when the ratio changes (e.g. the
 * window moves to a monitor with a different DPI, or the browser zoom shifts).
 * Uses a `matchMedia` query pinned to the current ratio; the moment it stops
 * matching, we re-read and re-subscribe.
 */
export function useDevicePixelRatio(): number {
  const [dpr, setDpr] = useState(getDevicePixelRatio)
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    const mq = window.matchMedia(`(resolution: ${dpr}dppx)`)
    const onChange = () => setDpr(getDevicePixelRatio())
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [dpr])
  return dpr
}
