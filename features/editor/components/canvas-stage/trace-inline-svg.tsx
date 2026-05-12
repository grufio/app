"use client"

/**
 * Inline DOM SVG renderer for trace images. Replaces Konva.Image
 * for SVG content so each region is its own addressable `<path>`
 * element with native browser hover/click — the same model
 * vtracer's own demo uses (https://www.visioncortex.org/vtracer/).
 *
 * Interaction model
 * - **Hover**: pure CSS `[data-trace-region]:hover` — works without
 *   JS, so the highlight responds instantly as the cursor moves.
 * - **Click**: a native `addEventListener('click')` on the container
 *   sets `selectedFill`. A `useEffect` then toggles a `data-selected`
 *   attribute on every path whose `data-fill` matches, and CSS picks
 *   that up to draw the same yellow outline. React's `onClick` is
 *   not used — it's unreliable for descendants of
 *   `dangerouslySetInnerHTML` (the SVG paths aren't React fibers,
 *   so the delegation walk can miss them).
 * - **Deselect**: Escape key or click anywhere outside the trace.
 *
 * Event pass-through
 * - The overlay covers the full image rect. `pointer-events: none`
 *   on the container + every SVG child (white background, grid
 *   lines, wrapper divs) lets every other interaction (Konva drag,
 *   resize handles, artboard selection, wheel-zoom over whitespace)
 *   pass through to the canvas behind. Only colored region paths
 *   override `pointer-events: all` so they actually catch hover/
 *   click. Wheel events that *do* land on a path (because of the
 *   path's `all`) are re-dispatched to the Konva canvas via
 *   `forwardWheelTo`.
 *
 * Positioning
 * - Container is `position: absolute`, sized + offset by the stage
 *   transform applied to the image's world rect. Updates in sync
 *   with the Konva stage's scale / pan / drag (see
 *   `onStageDragMove` in `stage-events-controller.ts`).
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
  /** Konva stage container — wheel events that land on a region path
   * are re-dispatched to its first child canvas so the existing
   * Konva wheel handler can apply pan/zoom. Without this, pinching
   * over a colored region does nothing because the inline SVG sits
   * above the canvas in DOM order. */
  forwardWheelTo?: HTMLElement | null
  /** When false the overlay is purely visual: region paths set
   * `pointer-events: none` so clicks fall through to the Konva
   * image-node below (object-tool drag/resize). When true the
   * trace regions catch hover + click for selection (direct-tool
   * on the Trace tab). */
  interactive?: boolean
}

export function TraceInlineSvg({ svgText, imageRect, view, rotation = 0, forwardWheelTo, interactive = true }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const prepared = useMemo(() => prepareTraceSvg(svgText), [svgText])
  const [selectedFill, setSelectedFill] = useState<string | null>(null)

  // Document-level deselect: Escape clears; click outside the
  // trace clears. The `containerRef.contains` guard prevents the
  // same click that just set the selection from immediately
  // clearing it (the native event bubbles all the way to document).
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

  // Clear any standing selection when interactivity is turned off
  // (tab/tool change). Without this the previously-clicked region
  // would keep its yellow outline even after pointer-events go off.
  useEffect(() => {
    if (!interactive) setSelectedFill(null)
  }, [interactive])

  // Click + wheel on the container — native listeners, not React
  // props. See file header for why React's event delegation can't
  // reach the dangerouslySetInnerHTML descendants reliably.
  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    if (!interactive) return

    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null
      const region = target?.closest("[data-trace-region]")
      if (!region) return
      e.stopPropagation()
      const fill = region.getAttribute("data-fill") ?? ""
      setSelectedFill(fill || null)
    }

    const onWheel = (e: WheelEvent) => {
      // Whitespace inside the trace has pointer-events: none, so
      // wheel only reaches here when the cursor is over a colored
      // region path. Re-dispatch to the Konva canvas so the existing
      // wheel handler runs (zoom / pan).
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

    root.addEventListener("click", onClick)
    root.addEventListener("wheel", onWheel, { passive: false })
    return () => {
      root.removeEventListener("click", onClick)
      root.removeEventListener("wheel", onWheel)
    }
  }, [forwardWheelTo, interactive])

  // Reflect `selectedFill` into the DOM by toggling `data-selected`
  // on every matching path. Direct DOM mutation is more debuggable
  // than the earlier approach of generating CSS rules with arbitrary
  // fill strings in the selector.
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
      data-interactive={interactive ? "true" : "false"}
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
        [data-testid="trace-inline-svg"],
        [data-testid="trace-inline-svg"] * {
          pointer-events: none;
        }
        [data-testid="trace-inline-svg"][data-interactive="true"] [data-trace-region] {
          cursor: pointer;
          pointer-events: all;
          transition: stroke 80ms ease;
        }
        [data-testid="trace-inline-svg"][data-interactive="true"] [data-trace-region]:hover,
        [data-testid="trace-inline-svg"][data-interactive="true"] [data-trace-region][data-selected] {
          stroke: #FFEA00;
          stroke-width: 4px;
          vector-effect: non-scaling-stroke;
          filter: drop-shadow(0 0 1px rgba(0,0,0,0.9));
        }
      `}</style>
      <div dangerouslySetInnerHTML={{ __html: prepared.html }} />
    </div>
  )
}
