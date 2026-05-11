"use client"

/**
 * Inline DOM SVG renderer for trace images. Replaces Konva.Image
 * for SVG content so each region is its own addressable `<path>`
 * element with native browser hover/click — exactly the model that
 * vtracer's own demo uses.
 *
 * Visual hover comes from a CSS rule (`[data-trace-region]:hover`),
 * not React state, so the highlight doesn't depend on render
 * cycles. Click + same-color-group highlighting is a tiny piece of
 * React state that generates a one-line CSS selector targeting
 * every path with the matching `data-fill`. Deselection: Escape
 * key or click anywhere outside the trace.
 *
 * Positioning math mirrors the previous overlay's: the container
 * is absolutely positioned in screen pixels, sized + offset by the
 * stage transform applied to the image's world rect.
 */
import { useEffect, useMemo, useRef, useState } from "react"

import { prepareTraceSvg } from "./prepare-trace-svg"

type ImageRect = {
  /** Image center in world (stage) coordinates. */
  x: number
  y: number
  /** Image bounds in world coordinates. */
  width: number
  height: number
}

type StageView = {
  /** Konva stage scale (uniform). */
  scale: number
  /** Konva stage offset (top-left of world in screen coords). */
  x: number
  y: number
}

type Props = {
  svgText: string
  imageRect: ImageRect
  view: StageView
  /** Rotation of the image in degrees (matches Konva's prop). */
  rotation?: number
  /** Optional Konva stage container — wheel events that land on the
   * inline SVG are re-dispatched to its first child canvas so the
   * existing Konva wheel handler can apply pan/zoom. Without this
   * forwarding, pinching over a trace region does nothing because the
   * inline SVG sits above the canvas in DOM order. */
  forwardWheelTo?: HTMLElement | null
}

export function TraceInlineSvg({ svgText, imageRect, view, rotation = 0, forwardWheelTo }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const prepared = useMemo(() => prepareTraceSvg(svgText), [svgText])
  const [selectedFill, setSelectedFill] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedFill(null)
    }
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (target && containerRef.current?.contains(target)) return
      setSelectedFill(null)
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("click", onDocClick)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("click", onDocClick)
    }
  }, [])

  // Click activation runs on a native event listener attached
  // directly to the container — React's onClick / event delegation
  // is unreliable for descendants of `dangerouslySetInnerHTML`
  // (the SVG paths aren't React fibers, so the delegation walk
  // can miss them). The user reported hover (CSS-only) working but
  // click not — exactly the symptom of that delegation gap.
  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (!target) return
      const region = target.closest("[data-trace-region]")
      if (!region) return
      e.stopPropagation()
      const fill = region.getAttribute("data-fill") ?? ""
      setSelectedFill(fill || null)
    }
    root.addEventListener("click", onClick)
    return () => root.removeEventListener("click", onClick)
  }, [])

  // Drive the click highlight via direct DOM mutation rather than a
  // generated CSS rule. The dynamic `<style>` approach was fragile —
  // CSS attribute selectors with arbitrary fill strings depended on
  // careful escaping and were hard to debug. Flipping a `data-selected`
  // attribute on each matching path is direct, observable in DevTools,
  // and works regardless of what the fill value looks like.
  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    const paths = root.querySelectorAll<SVGElement>("[data-trace-region]")
    paths.forEach((p) => {
      const matches = selectedFill != null && p.getAttribute("data-fill") === selectedFill
      if (matches) p.setAttribute("data-selected", "")
      else p.removeAttribute("data-selected")
    })
  }, [selectedFill, prepared])

  if (!prepared) return null

  const onContainerWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    // Forward wheel events to the Konva stage container so pinch/
    // Ctrl+wheel zoom and trackpad pan still work when the cursor is
    // over the trace. Without this the inline SVG silently swallows
    // wheel events that should reach the Konva listener.
    if (!forwardWheelTo) return
    e.preventDefault()
    const target = forwardWheelTo.querySelector("canvas") ?? forwardWheelTo
    target.dispatchEvent(
      new WheelEvent("wheel", {
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        deltaZ: e.deltaZ,
        deltaMode: e.deltaMode,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        clientX: e.clientX,
        clientY: e.clientY,
        bubbles: true,
        cancelable: true,
      }),
    )
  }

  const screenW = imageRect.width * view.scale
  const screenH = imageRect.height * view.scale
  const centerScreenX = view.x + imageRect.x * view.scale
  const centerScreenY = view.y + imageRect.y * view.scale
  const left = centerScreenX - screenW / 2
  const top = centerScreenY - screenH / 2

  return (
    <div
      ref={containerRef}
      data-testid="trace-inline-svg"
      onWheel={onContainerWheel}
      style={{
        position: "absolute",
        left,
        top,
        width: screenW,
        height: screenH,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        transformOrigin: "center",
        lineHeight: 0,
      }}
    >
      <style>{`
        /* The overlay covers the whole image rect — without these
         * rules every click in that rect would land on the trace and
         * never reach Konva, blocking artboard/image selection,
         * resize handles, drag, etc. Container + non-interactive
         * children pass events through; only the colored region
         * paths catch them. */
        [data-testid="trace-inline-svg"],
        [data-testid="trace-inline-svg"] * {
          pointer-events: none;
        }
        [data-testid="trace-inline-svg"] [data-trace-region] {
          cursor: pointer;
          pointer-events: all;
          transition: stroke 80ms ease;
        }
        [data-testid="trace-inline-svg"] [data-trace-region]:hover,
        [data-testid="trace-inline-svg"] [data-trace-region][data-selected] {
          /* High-contrast canary yellow stands out against most palette
           * colors in numerate traces (which tend toward muted greens,
           * browns, blues). Red got lost on red-leaning regions. */
          stroke: #FFEA00;
          /* Fixed screen-pixel width via non-scaling-stroke so the
           * outline stays clearly visible regardless of zoom — the
           * trace's own configured stroke (1 SVG unit) renders sub-
           * pixel at typical zoom levels and looks anti-aliased to a
           * grey hair. */
          stroke-width: 4px;
          vector-effect: non-scaling-stroke;
          /* Thin black halo so the yellow outline reads clearly even
           * on bright/yellow regions. */
          filter: drop-shadow(0 0 1px rgba(0,0,0,0.9));
        }
      `}</style>
      <div dangerouslySetInnerHTML={{ __html: prepared.html }} />
    </div>
  )
}
