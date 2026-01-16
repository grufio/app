"use client"

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import { Image as KonvaImage, Layer, Stage } from "react-konva"
import type Konva from "konva"

type Props = {
  src: string
  alt?: string
  className?: string
  panEnabled?: boolean
}

export type ProjectImageCanvasHandle = {
  fitToView: () => void
  zoomIn: () => void
  zoomOut: () => void
  rotate90: () => void
}

function useHtmlImage(src: string | null) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    if (!src) {
      setImg(null)
      return
    }
    const i = new window.Image()
    i.crossOrigin = "anonymous"
    i.onload = () => setImg(i)
    i.onerror = () => setImg(null)
    i.src = src
    return () => {
      // best-effort cleanup
      i.onload = null
      i.onerror = null
    }
  }, [src])

  return img
}

export const ProjectImageCanvas = forwardRef<ProjectImageCanvasHandle, Props>(function ProjectImageCanvas(
  { src, alt, className, panEnabled = true },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<Konva.Stage | null>(null)

  const img = useHtmlImage(src)

  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 })
  const [rotation, setRotation] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      setSize({ w: Math.max(0, Math.floor(r.width)), h: Math.max(0, Math.floor(r.height)) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fit = useMemo(() => {
    if (!img || size.w === 0 || size.h === 0) return null
    const scale = Math.min(size.w / img.width, size.h / img.height)
    const x = (size.w - img.width * scale) / 2
    const y = (size.h - img.height * scale) / 2
    return { scale, x, y }
  }, [img, size.h, size.w])

  // Reset view when a new image is loaded (fit-to-view)
  useEffect(() => {
    if (!fit) return
    setView({ scale: fit.scale, x: fit.x, y: fit.y })
  }, [fit?.scale, fit?.x, fit?.y]) // eslint-disable-line react-hooks/exhaustive-deps

  const fitToView = () => {
    if (!fit) return
    setView({ scale: fit.scale, x: fit.x, y: fit.y })
  }

  const zoomBy = (factor: number) => {
    const stage = stageRef.current
    if (!stage) return
    const pointer = stage.getPointerPosition() ?? { x: size.w / 2, y: size.h / 2 }

    setView((v) => {
      const oldScale = v.scale
      const newScale = Math.max(0.05, Math.min(8, oldScale * factor))

      // Zoom around cursor (or center if cursor is outside the stage)
      const mousePointTo = {
        x: (pointer.x - v.x) / oldScale,
        y: (pointer.y - v.y) / oldScale,
      }
      const nextX = pointer.x - mousePointTo.x * newScale
      const nextY = pointer.y - mousePointTo.y * newScale
      return { scale: newScale, x: nextX, y: nextY }
    })
  }

  const zoomIn = () => zoomBy(1.15)
  const zoomOut = () => zoomBy(1 / 1.15)
  const rotate90 = () => setRotation((r) => (r + 90) % 360)

  useImperativeHandle(
    ref,
    () => ({
      fitToView,
      zoomIn,
      zoomOut,
      rotate90,
    }),
    [fit] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    zoomBy(e.evt.deltaY > 0 ? 1 / 1.08 : 1.08)
  }

  if (!src) {
    return null
  }

  return (
    <div ref={containerRef} className={className} aria-label={alt}>
      <Stage
        ref={(n) => {
          stageRef.current = n
        }}
        width={size.w}
        height={size.h}
        scaleX={view.scale}
        scaleY={view.scale}
        x={view.x}
        y={view.y}
        draggable={panEnabled}
        onDragEnd={(e) => setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }))}
        onWheel={onWheel}
      >
        <Layer>
          {img ? (
            <KonvaImage
              image={img}
              listening={false}
              rotation={rotation}
              offsetX={img.width / 2}
              offsetY={img.height / 2}
              x={img.width / 2}
              y={img.height / 2}
            />
          ) : null}
        </Layer>
      </Stage>
    </div>
  )
})

