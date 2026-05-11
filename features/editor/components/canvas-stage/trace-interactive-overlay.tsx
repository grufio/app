"use client"

/**
 * DOM SVG overlay that sits on top of the Konva-rasterised trace
 * image and provides per-region hover + click highlighting.
 *
 * The overlay paths are invisible at rest (`fill="transparent"`,
 * `stroke="transparent"`) and only render a red outline on hover
 * (single region) or click (the clicked region + all paths sharing
 * its original fill color — paint-by-numbers grouping). The
 * underlying Konva.Image stays the source of truth for the visible
 * body of the trace; this overlay is purely an interactivity
 * layer.
 *
 * Positioning: the container is `position: absolute` and gets the
 * trace image's screen rect computed from (stage transform) +
 * (image world position). The inner `<svg>` carries the original
 * image's viewBox so paths in image-pixel coordinates render at
 * the right place relative to the (potentially zoomed/panned)
 * underlying Konva image.
 */
import { useEffect, useMemo, useRef, useState } from "react"

import { parseTraceSvg, type ParsedTraceSvg } from "./parse-trace-svg"

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

export function TraceInteractiveOverlay({ svgText, imageRect, view, rotation = 0 }: Props) {
  const parsed = useMemo<ParsedTraceSvg | null>(() => parseTraceSvg(svgText), [svgText])

  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [selectedFill, setSelectedFill] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Deselect on Escape + on click outside any region. The path's
  // onClick stops propagation, so document-level click only fires
  // when the user clicked empty space (canvas, sidebar, etc.).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedFill(null)
    }
    const onDocClick = () => setSelectedFill(null)
    document.addEventListener("keydown", onKey)
    document.addEventListener("click", onDocClick)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("click", onDocClick)
    }
  }, [])

  if (!parsed || parsed.paths.length === 0) return null

  const screenW = imageRect.width * view.scale
  const screenH = imageRect.height * view.scale
  // Konva.Image uses center-origin (offsetX = width/2). Mirror that
  // so the overlay's top-left aligns with the image's top-left in
  // screen space.
  const centerScreenX = view.x + imageRect.x * view.scale
  const centerScreenY = view.y + imageRect.y * view.scale
  const left = centerScreenX - screenW / 2
  const top = centerScreenY - screenH / 2

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute"
      style={{
        left,
        top,
        width: screenW,
        height: screenH,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        transformOrigin: "center",
      }}
      data-testid="trace-interactive-overlay"
    >
      <svg
        viewBox={parsed.viewBox || `0 0 ${parsed.width} ${parsed.height}`}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        style={{ overflow: "visible" }}
      >
        <g transform={parsed.groupTransform ?? undefined}>
          {parsed.paths.map((p, idx) => {
            const isHovered = hoveredIdx === idx
            const isSelected = selectedFill !== null && p.fill === selectedFill
            const highlight = isHovered || isSelected
            return (
              <path
                // eslint-disable-next-line react/no-array-index-key
                key={idx}
                d={p.d}
                transform={p.transform ?? undefined}
                fill="transparent"
                stroke={highlight ? "red" : "transparent"}
                strokeWidth={highlight ? parsed.detectedStrokeWidth : 0}
                pointerEvents="all"
                style={{ cursor: "pointer", pointerEvents: "all" }}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx((cur) => (cur === idx ? null : cur))}
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedFill(p.fill || null)
                }}
              />
            )
          })}
        </g>
      </svg>
    </div>
  )
}
