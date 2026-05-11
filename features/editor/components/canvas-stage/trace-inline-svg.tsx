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
}

/**
 * Keep only characters that are safe inside a CSS attribute selector
 * value (`[data-fill="..."]`). Hex colors and simple numeric forms
 * pass through unchanged; anything weirder (e.g. `url(...)`, `rgb(`)
 * has its danger chars stripped so the generated rule stays valid.
 */
function escapeAttrSelectorValue(v: string): string {
  return v.replace(/[^a-zA-Z0-9#.,()%/\s_-]/g, "")
}

export function TraceInlineSvg({ svgText, imageRect, view, rotation = 0 }: Props) {
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

  if (!prepared) return null

  const onContainerClick = (e: React.MouseEvent) => {
    const target = e.target as Element
    const region = target.closest("[data-trace-region]")
    if (!region) return
    // Stop propagation so the document-click deselect doesn't fire
    // on the same native event (React stops synthetic only; the
    // containerRef.contains guard above handles the native path).
    e.stopPropagation()
    const fill = region.getAttribute("data-fill") ?? ""
    setSelectedFill(fill || null)
  }

  const screenW = imageRect.width * view.scale
  const screenH = imageRect.height * view.scale
  const centerScreenX = view.x + imageRect.x * view.scale
  const centerScreenY = view.y + imageRect.y * view.scale
  const left = centerScreenX - screenW / 2
  const top = centerScreenY - screenH / 2

  const safeSelectedFill = selectedFill ? escapeAttrSelectorValue(selectedFill) : null

  return (
    <div
      ref={containerRef}
      data-testid="trace-inline-svg"
      onClick={onContainerClick}
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
        [data-testid="trace-inline-svg"] [data-trace-region] {
          cursor: pointer;
          pointer-events: all;
          transition: stroke 80ms ease;
        }
        [data-testid="trace-inline-svg"] [data-trace-region]:hover {
          stroke: red;
          stroke-width: ${prepared.strokeWidth};
        }
        ${safeSelectedFill
          ? `[data-testid="trace-inline-svg"] [data-trace-region][data-fill="${safeSelectedFill}"] { stroke: red; stroke-width: ${prepared.strokeWidth}; }`
          : ""}
      `}</style>
      <div dangerouslySetInnerHTML={{ __html: prepared.html }} />
    </div>
  )
}
