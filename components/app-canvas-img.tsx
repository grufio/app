"use client"

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import { Image as KonvaImage, Layer, Rect, Stage } from "react-konva"
import type Konva from "konva"

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

export type ProjectImageCanvasHandle = {
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
      // best-effort cleanup
      setImg(null)
      i.onload = null
      i.onerror = null
    }
  }, [src])

  return img
}

export const ProjectImageCanvas = forwardRef<ProjectImageCanvasHandle, Props>(function ProjectImageCanvas(
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
  const [imageTx, setImageTx] = useState<{
    x: number
    y: number
    scaleX: number
    scaleY: number
  } | null>(null)
  const userInteractedRef = useRef(false)

  // Prevent browser page zoom / scroll stealing (Cmd/Ctrl + wheel / trackpad pinch).
  // Konva's internal listeners can be passive in some environments, so we add an explicit non-passive listener.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (evt: WheelEvent) => {
      if (evt.ctrlKey || evt.metaKey) {
        evt.preventDefault()
      }
    }
    el.addEventListener("wheel", handler, { passive: false })
    return () => el.removeEventListener("wheel", handler)
  }, [])

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

  const world = useMemo(() => {
    const w = artboardWidthPx && artboardWidthPx > 0 ? artboardWidthPx : img?.width
    const h = artboardHeightPx && artboardHeightPx > 0 ? artboardHeightPx : img?.height
    if (!w || !h) return null
    return { w, h }
  }, [artboardHeightPx, artboardWidthPx, img?.height, img?.width])

  const fit = useMemo(() => {
    if (!world || size.w === 0 || size.h === 0) return null
    const scale = Math.min(size.w / world.w, size.h / world.h)
    const x = (size.w - world.w * scale) / 2
    const y = (size.h - world.h * scale) / 2
    return { scale, x, y }
  }, [size.h, size.w, world])

  // Fit the current "world" into the viewport when it first becomes available.
  // Do not override the user's view once they've started interacting (zoom/pan).
  useEffect(() => {
    if (!fit || !img || !world) return
    if (userInteractedRef.current) return
    const key = `${src}:${world.w}x${world.h}`
    if (lastAutoFitKeyRef.current === key) return
    lastAutoFitKeyRef.current = key
    setView({ scale: fit.scale, x: fit.x, y: fit.y })
  }, [fit, img, src, world])

  const fitToView = () => {
    if (!fit) return
    userInteractedRef.current = false
    setView({ scale: fit.scale, x: fit.x, y: fit.y })
  }

  const showArtboard = Boolean(world && artboardWidthPx && artboardHeightPx)
  const artW = world?.w ?? 0
  const artH = world?.h ?? 0

  const zoomBy = (factor: number) => {
    const stage = stageRef.current
    if (!stage) return
    const pointer = stage.getPointerPosition() ?? { x: size.w / 2, y: size.h / 2 }

    setView((v) => {
      const oldScale = v.scale
      userInteractedRef.current = true
      const newScale = Math.max(0.01, Math.min(8, oldScale * factor))

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
      setImageSize,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fit, img, showArtboard, artW, artH]
  )

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const isZoomGesture = e.evt.ctrlKey || e.evt.metaKey

    // Illustrator-like:
    // - wheel = pan (scroll)
    // - ctrl/cmd + wheel = zoom
    if (isZoomGesture) {
      userInteractedRef.current = true
      zoomBy(e.evt.deltaY > 0 ? 1 / 1.08 : 1.08)
      return
    }

    userInteractedRef.current = true
    const dx = e.evt.deltaX
    const dy = e.evt.deltaY
    setView((v) => {
      // Stage x/y are in screen px. This matches the wheel deltas.
      // Invert so wheel-down moves content up (natural).
      const nextX = v.x - dx
      const nextY = v.y - dy
      return { ...v, x: nextX, y: nextY }
    })
  }

  const reportImageSize = useCallback(
    (tx: { scaleX: number; scaleY: number } | null) => {
      if (!img || !tx) return
      onImageSizeChange?.(Math.round(img.width * tx.scaleX), Math.round(img.height * tx.scaleY))
    },
    [img, onImageSizeChange]
  )

  // Place the image ONCE. After that, the image must stay independent from the artboard
  // (artboard changes must NOT move/scale the image).
  useEffect(() => {
    if (!src) return
    if (!img) return
    const key = src
    if (placedKeyRef.current === key) return
    placedKeyRef.current = key
    // Default: place once, fitted into the artboard (then independent).
    const initialScale =
      showArtboard && artW > 0 && artH > 0 ? Math.min(artW / img.width, artH / img.height) : 1
    const x = showArtboard ? artW / 2 : img.width / 2
    const y = showArtboard ? artH / 2 : img.height / 2
    const tx = { x, y, scaleX: initialScale, scaleY: initialScale }
    setImageTx(tx)
    reportImageSize(tx)
  }, [artH, artW, img, reportImageSize, showArtboard, src])

  const setImageSize = (widthPx: number, heightPx: number) => {
    if (!img) return
    const w = Number(widthPx)
    const h = Number(heightPx)
    // Lock aspect ratio: use width if valid, else height.
    const scale =
      Number.isFinite(w) && w > 0
        ? w / img.width
        : Number.isFinite(h) && h > 0
          ? h / img.height
          : null
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
  }

  if (!src) {
    return null
  }

  return (
    <div
      ref={containerRef}
      className={className}
      aria-label={alt}
      style={{ touchAction: "none" }}
    >
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
          // Konva drag events bubble: only treat it as viewport pan when the Stage itself is dragged.
          if (e.target === stageRef.current) {
            userInteractedRef.current = true
          }
        }}
        onDragEnd={(e) => {
          const stage = stageRef.current
          if (!stage) return
          // Konva drag events bubble: ignore image drags.
          if (e.target !== stage) return
          setView((v) => ({ ...v, x: stage.x(), y: stage.y() }))
        }}
        onWheel={onWheel}
      >
        <Layer>
          {/* Artboard background (behind image) */}
          {showArtboard ? (
            <Rect
              x={0}
              y={0}
              width={artW}
              height={artH}
              fill="#ffffff"
              listening={false}
            />
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
                  const next = {
                    x: n.x(),
                    y: n.y(),
                    scaleX: prev?.scaleX ?? 1,
                    scaleY: prev?.scaleY ?? 1,
                  }
                  reportImageSize(next)
                  return next
                })
              }}
            />
          ) : null}

          {/* Artboard border on top so it never "disappears" behind the image */}
          {showArtboard ? (
            <Rect
              x={0}
              y={0}
              width={artW}
              height={artH}
              stroke="#ff0000"
              strokeWidth={2}
              listening={false}
            />
          ) : null}
        </Layer>
      </Stage>
    </div>
  )
})

