"use client"

/**
 * Device-pixel-ratio helpers for crisp canvas hairlines.
 *
 * The Konva layer canvas renders at `window.devicePixelRatio` (verified: on a
 * 2× display the layer's backing store is 2× the CSS size). So a Konva
 * `strokeWidth` of 1 is 1 CSS px = `dpr` device px. To draw a true
 * 1-physical-pixel hairline, pass `strokeWidth = 1 / dpr`.
 */
import { useSyncExternalStore } from "react"

/** SSR-safe `window.devicePixelRatio`, floored at 1. */
export function getDevicePixelRatio(): number {
  if (typeof window === "undefined" || !Number.isFinite(Number(window.devicePixelRatio))) return 1
  return Math.max(1, Number(window.devicePixelRatio))
}

/** Subscribe to ratio changes (monitor DPI / browser zoom). The media query is
 *  pinned to the current ratio; the moment it stops matching we notify React,
 *  which re-reads the snapshot. */
function subscribeDpr(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {}
  const mq = window.matchMedia(`(resolution: ${getDevicePixelRatio()}dppx)`)
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}

/**
 * Reactive device pixel ratio. Uses `useSyncExternalStore` so the snapshot is
 * read straight from `window.devicePixelRatio` on EVERY render — the client
 * always gets the real ratio (no stale hydration value, no setState-in-effect),
 * with a plain `1` on the server. This is what a `1/dpr` hairline relies on:
 * if this returned a stale `1` on a 2× display, the hairline would render at
 * 1 CSS px = 2 device px = too thick.
 */
export function useDevicePixelRatio(): number {
  return useSyncExternalStore(subscribeDpr, getDevicePixelRatio, () => 1)
}

/**
 * Canonical trace-region CONTOUR stroke width, in CSS px — ONE physical device
 * pixel (the thinnest crisp hairline). Single source of truth for the applied
 * trace outline across every kind: pixelate grid + circulate frames (Konva) and
 * linerate region outlines (DOM SVG). Konva multiplies this by the layer's dpr →
 * 1 device px with `strokeScaleEnabled:false`; on the DOM SVG it MUST be paired
 * with `vector-effect: non-scaling-stroke` so it renders 1 device px regardless
 * of the (stretched) viewBox. Defined once here so it can never diverge again.
 */
export function useTraceContourStrokeCssPx(): number {
  return 1 / useDevicePixelRatio()
}
