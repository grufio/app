"use client"

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import { Image as KonvaImage, Layer, Rect, Stage } from "react-konva"
import type Konva from "konva"

import { fitToWorld, panBy, scaleToMatchAspect, zoomAround } from "@/lib/editor/canvas-model"

type Props = {
  src: string
  alt?: string
  className?: string
  panEnabled?: boolean
  imageDraggable?: boolean
  artboardWidthPx?: number
  artboardHeightPx?: number
  onImageSizeChange?: (widthPx: number, heightPx: number) => void
}

export type ProjectCanvasStageHandle = {
  fitToView: () => void
  zoomIn: () => void
  zoomOut: () => void
  rotate90: () => void
  setImageSize: (widthPx: number, heightPx: number) => void
}

function useHtmlImage(src: string | null) {
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

/**
 * Konva stage for the project editor.
 *
 * Interaction model (Illustrator-like):
 * - wheel: pan
 * - cmd/ctrl + wheel: zoom around cursor
 * - Hand tool: drag stage (pan)
 * - Pointer tool: drag image
 *
 * The Artboard is a fixed world rect; the image transform is independent.
 */
export const ProjectCanvasStage = forwardRef<ProjectCanvasStageHandle, Props>(function ProjectCanvasStage(
  {
    src,
    alt,
    className,
    panEnabled = true,
    imageDraggable = false,
    artboardWidthPx,
    artboardHeightPx,
    onImageSizeChange,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<Konva.Stage | null>(null)
  const img = useHtmlImage(src)

  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 })
  const [rotation, setRotation] = useState(0)

  const lastAutoFitKeyRef = useRef<string | null>(null)
  const placedKeyRef = useRef<string | null>(null)
  const userInteractedRef = useRef(false)

  const [imageTx, setImageTx] = useState<{ x: number; y: number; scaleX: number; scaleY: number } | null>(null)
  const panRafRef = useRef<number | null>(null)
  const panDeltaRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 })

  // Prevent browser page zoom / scroll stealing (Cmd/Ctrl + wheel / trackpad pinch).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (evt: WheelEvent) => {
      if (evt.ctrlKey || evt.metaKey) evt.preventDefault()
    }
    el.addEventListener("wheel", handler, { passive: false })
    return () => el.removeEventListener("wheel", handler)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      const next = { w: Math.max(0, Math.floor(r.width)), h: Math.max(0, Math.floor(r.height)) }
      setSize((prev) => (prev.w === next.w && prev.h === next.h ? prev : next))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const world = useMemo(() => {
    const w = artboardWidthPx && artboardWidthPx > 0 ? artboardWidthPx : img?.width
    const h = artboardHeightPx && artboardHeightPx > 0 ? artboardHeightPx : img?.height
    if (!w || !h) return null
    return { w, h }
  }, [artboardHeightPx, artboardWidthPx, img?.height, img?.width])

  const showArtboard = Boolean(world && artboardWidthPx && artboardHeightPx)
  const artW = world?.w ?? 0
  const artH = world?.h ?? 0

  const fit = useMemo(() => {
    if (!world || size.w === 0 || size.h === 0) return null
    return fitToWorld(size, world)
  }, [size.h, size.w, world])

  useEffect(() => {
    if (!fit || !img || !world) return
    if (userInteractedRef.current) return
    const key = `${src}:${world.w}x${world.h}`
    if (lastAutoFitKeyRef.current === key) return
    lastAutoFitKeyRef.current = key
    setView({ scale: fit.scale, x: fit.x, y: fit.y })
  }, [fit, img, src, world])

  const fitToView = useCallback(() => {
    if (!fit) return
    userInteractedRef.current = false
    setView({ scale: fit.scale, x: fit.x, y: fit.y })
  }, [fit])

  const zoomBy = useCallback(
    (factor: number) => {
      const stage = stageRef.current
      if (!stage) return
      const pointer = stage.getPointerPosition() ?? { x: size.w / 2, y: size.h / 2 }

      setView((v) => {
        userInteractedRef.current = true
        return zoomAround(v, pointer, factor)
      })
    },
    [size.h, size.w]
  )

  const zoomIn = useCallback(() => zoomBy(1.15), [zoomBy])
  const zoomOut = useCallback(() => zoomBy(1 / 1.15), [zoomBy])
  const rotate90 = useCallback(() => setRotation((r) => (r + 90) % 360), [])

  const reportImageSize = useCallback(
    (tx: { scaleX: number; scaleY: number } | null) => {
      if (!img || !tx) return
      onImageSizeChange?.(Math.round(img.width * tx.scaleX), Math.round(img.height * tx.scaleY))
    },
    [img, onImageSizeChange]
  )

  useEffect(() => {
    if (!src) return
    if (!img) return
    const key = src
    if (placedKeyRef.current === key) return
    placedKeyRef.current = key
    const initialScale = showArtboard && artW > 0 && artH > 0 ? Math.min(artW / img.width, artH / img.height) : 1
    const x = showArtboard ? artW / 2 : img.width / 2
    const y = showArtboard ? artH / 2 : img.height / 2
    const tx = { x, y, scaleX: initialScale, scaleY: initialScale }
    setImageTx(tx)
    reportImageSize(tx)
  }, [artH, artW, img, reportImageSize, showArtboard, src])

  const setImageSize = useCallback(
    (widthPx: number, heightPx: number) => {
      if (!img) return
      const scale = scaleToMatchAspect(img.width, img.height, widthPx, heightPx)
      if (!scale || !Number.isFinite(scale) || scale <= 0) return

      setImageTx((prev) => {
        const next = {
          x: prev?.x ?? (showArtboard ? artW / 2 : img.width / 2),
          y: prev?.y ?? (showArtboard ? artH / 2 : img.height / 2),
          scaleX: scale,
          scaleY: scale,
        }
        reportImageSize(next)
        return next
      })
    },
    [artH, artW, img, reportImageSize, showArtboard]
  )

  useImperativeHandle(
    ref,
    () => ({ fitToView, zoomIn, zoomOut, rotate90, setImageSize }),
    [fitToView, rotate90, setImageSize, zoomIn, zoomOut]
  )

  const onWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault()
      const isZoomGesture = e.evt.ctrlKey || e.evt.metaKey

      if (isZoomGesture) {
        zoomBy(e.evt.deltaY > 0 ? 1 / 1.08 : 1.08)
        return
      }

      userInteractedRef.current = true
      panDeltaRef.current.dx += e.evt.deltaX
      panDeltaRef.current.dy += e.evt.deltaY

      if (panRafRef.current != null) return
      panRafRef.current = requestAnimationFrame(() => {
        panRafRef.current = null
        const { dx, dy } = panDeltaRef.current
        panDeltaRef.current = { dx: 0, dy: 0 }
        setView((v) => panBy(v, dx, dy))
      })
    },
    [zoomBy]
  )

  if (!src) return null

  return (
    <div ref={containerRef} className={className} aria-label={alt} style={{ touchAction: "none" }}>
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
        onDragStart={(e) => {
          if (e.target === stageRef.current) userInteractedRef.current = true
        }}
        onDragEnd={(e) => {
          const stage = stageRef.current
          if (!stage) return
          if (e.target !== stage) return
          setView((v) => ({ ...v, x: stage.x(), y: stage.y() }))
        }}
        onWheel={onWheel}
      >
        <Layer>
          {showArtboard ? (
            <Rect x={0} y={0} width={artW} height={artH} fill="#ffffff" listening={false} />
          ) : null}

          {img ? (
            <KonvaImage
              image={img}
              listening={imageDraggable}
              rotation={rotation}
              scaleX={imageTx?.scaleX ?? 1}
              scaleY={imageTx?.scaleY ?? 1}
              offsetX={img.width / 2}
              offsetY={img.height / 2}
              x={imageTx?.x ?? img.width / 2}
              y={imageTx?.y ?? img.height / 2}
              draggable={imageDraggable}
              onDragStart={() => {
                userInteractedRef.current = true
              }}
              onDragEnd={(e) => {
                const n = e.target
                setImageTx((prev) => {
                  const next = { x: n.x(), y: n.y(), scaleX: prev?.scaleX ?? 1, scaleY: prev?.scaleY ?? 1 }
                  reportImageSize(next)
                  return next
                })
              }}
            />
          ) : null}

          {showArtboard ? (
            <Rect x={0} y={0} width={artW} height={artH} stroke="#ff0000" strokeWidth={2} listening={false} />
          ) : null}
        </Layer>
      </Stage>
    </div>
  )
})

