"use client"

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import { Image as KonvaImage, Layer, Line, Rect, Stage } from "react-konva"
import type Konva from "konva"

import { panBy } from "@/lib/editor/canvas-model"

type Props = {
  src?: string
  alt?: string
  className?: string
  panEnabled?: boolean
  imageDraggable?: boolean
  /** Padding used for initial auto-fit and fit-to-view action. */
  fitPaddingPx?: number
  /** Whether to render the artboard background/border. (Thumbnails want image-only.) */
  renderArtboard?: boolean
  artboardWidthPx?: number
  artboardHeightPx?: number
  onImageSizeChange?: (widthPx: number, heightPx: number) => void
  initialImageTransform?: {
    x: number
    y: number
    scaleX: number
    scaleY: number
    widthPx?: number
    heightPx?: number
    rotationDeg: number
  } | null
  onImageTransformCommit?: (t: {
    x: number
    y: number
    scaleX: number
    scaleY: number
    widthPx?: number
    heightPx?: number
    rotationDeg: number
  }) => void
}

export type ProjectCanvasStageHandle = {
  fitToView: () => void
  zoomIn: () => void
  zoomOut: () => void
  rotate90: () => void
  /**
   * Resize the image in canvas-space (px).
   * Pass `NaN` for a dimension to keep that axis unchanged.
   */
  setImageSize: (widthPx: number, heightPx: number) => void
  /**
   * Align the image position relative to the artboard.
   * Uses the image node's axis-aligned bounding box (includes rotation).
   */
  alignImage: (opts: { x?: "left" | "center" | "right"; y?: "top" | "center" | "bottom" }) => void
  /**
   * Restore the "working copy" state of the image back to its original placement.
   * This resets rotation and re-fits the image into the current artboard.
   */
  restoreImage: () => void
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
    renderArtboard = true,
    artboardWidthPx,
    artboardHeightPx,
    onImageSizeChange,
    initialImageTransform,
    onImageTransformCommit,
  },
  ref
) {
  const round4 = (n: number) => Math.round(n * 10_000) / 10_000
  const containerRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<Konva.Stage | null>(null)
  const layerRef = useRef<Konva.Layer | null>(null)
  const imageNodeRef = useRef<Konva.Image | null>(null)
  const img = useHtmlImage(src ?? null)

  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 })
  const [rotation, setRotation] = useState(0)

  // (legacy) was used for auto-fit; zoom/fitting is forbidden by the PX-WORLD + DPI-image-scale model.
  const placedKeyRef = useRef<string | null>(null)
  const appliedInitialTransformKeyRef = useRef<string | null>(null)
  const userInteractedRef = useRef(false)
  const userChangedImageTxRef = useRef(false)
  const commitTimerRef = useRef<number | null>(null)
  const pendingCommitRef = useRef<{ tx: { x: number; y: number; scaleX: number; scaleY: number } | null; rot: number } | null>(
    null
  )

  const [imageTx, setImageTx] = useState<{ x: number; y: number; scaleX: number; scaleY: number } | null>(null)
  const imageTxRef = useRef<{ x: number; y: number; scaleX: number; scaleY: number } | null>(null)
  const [imageBounds, setImageBounds] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const rotationRef = useRef(0)
  useEffect(() => {
    rotationRef.current = rotation
  }, [rotation])

  useEffect(() => {
    imageTxRef.current = imageTx
  }, [imageTx])

  const boundsRafRef = useRef<number | null>(null)
  const panRafRef = useRef<number | null>(null)
  const panDeltaRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 })
  const onImageSizeChangeRef = useRef<Props["onImageSizeChange"]>(onImageSizeChange)

  useEffect(() => {
    onImageSizeChangeRef.current = onImageSizeChange
  }, [onImageSizeChange])

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

  // `hasArtboard` controls layout math and must be based on explicit artboard px inputs.
  // (No fallback to image size here.)
  const hasArtboard = Boolean((artboardWidthPx ?? 0) > 0 && (artboardHeightPx ?? 0) > 0)
  // `drawArtboard` controls only whether the artboard visuals are rendered.
  const drawArtboard = renderArtboard && hasArtboard
  const artW = world?.w ?? 0
  const artH = world?.h ?? 0
  const borderColor = "#000000"
  const borderWidth = 1
  const selectionColor = "#000000"
  const selectionDash: number[] | undefined = undefined
  const selectionHandlePx = 8

  // Pixel-snap helper: for a 1px stroke, canvas looks crispest when the line center
  // lands on N + 0.5 device pixels in screen space.
  const snapWorldToDeviceHalfPixel = useCallback(
    (worldCoord: number, axis: "x" | "y") => {
      const scale = 1
      const offset = axis === "x" ? view.x : view.y
      const screen = offset + worldCoord * scale
      const snapped = Math.round(screen - 0.5) + 0.5
      return (snapped - offset) / scale
    },
    [view.x, view.y]
  )

  const fitToView = useCallback(() => {
    // API kept for UI wiring; PX-WORLD invariant: Stage scale stays 1. We only reset pan.
    userInteractedRef.current = false
    setView((v) => ({ ...v, scale: 1, x: 0, y: 0 }))
  }, [])

  const zoomIn = useCallback(() => {}, [])
  const zoomOut = useCallback(() => {}, [])

  const reportImageSize = useCallback(
    (tx: { scaleX: number; scaleY: number } | null) => {
      if (!img || !tx) return
      onImageSizeChangeRef.current?.(round4(img.width * tx.scaleX), round4(img.height * tx.scaleY))
    },
    [img]
  )

  // Report image size to the parent *after* state commits.
  // Do NOT call `onImageSizeChange` inside state updaters; it can trigger
  // "Cannot update a component while rendering a different component" in React.
  useEffect(() => {
    reportImageSize(imageTx)
  }, [imageTx, reportImageSize])

  const updateImageBoundsFromNode = useCallback(() => {
    if (!imageDraggable) return
    const layer = layerRef.current
    const node = imageNodeRef.current
    if (!layer || !node) return
    const r = node.getClientRect({ relativeTo: layer })
    const next = { x: r.x, y: r.y, w: r.width, h: r.height }
    setImageBounds((prev) => {
      if (!prev) return next
      const eps = 0.01
      if (
        Math.abs(prev.x - next.x) < eps &&
        Math.abs(prev.y - next.y) < eps &&
        Math.abs(prev.w - next.w) < eps &&
        Math.abs(prev.h - next.h) < eps
      )
        return prev
      return next
    })
  }, [imageDraggable])

  const scheduleBoundsUpdate = useCallback(() => {
    if (boundsRafRef.current != null) return
    boundsRafRef.current = requestAnimationFrame(() => {
      boundsRafRef.current = null
      updateImageBoundsFromNode()
    })
  }, [updateImageBoundsFromNode])

  // Apply persisted image state even if it arrives after initial placement.
  useEffect(() => {
    if (!img) return
    if (!src) return
    if (!initialImageTransform) return
    if (userChangedImageTxRef.current) return
    if (appliedInitialTransformKeyRef.current === src) return

    const x = Number(initialImageTransform.x)
    const y = Number(initialImageTransform.y)
    const scaleX = Number(initialImageTransform.scaleX)
    const scaleY = Number(initialImageTransform.scaleY)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY)) return

    appliedInitialTransformKeyRef.current = src
    queueMicrotask(() => {
      const rotationDeg = Number(initialImageTransform.rotationDeg)
      setRotation(Number.isFinite(rotationDeg) ? rotationDeg : 0)
      setImageTx({ x, y, scaleX, scaleY })
      scheduleBoundsUpdate()
    })
  }, [img, initialImageTransform, scheduleBoundsUpdate, src])

  // DPI is metadata-only. Rendering must never use it.

  // Compute selection bounds (axis-aligned) for the image node.
  // Shown by default when the Select tool is active (`imageDraggable === true`).
  useEffect(() => {
    if (!imageDraggable) {
      queueMicrotask(() => setImageBounds(null))
      return
    }
    // Avoid doing `getClientRect()` synchronously on every render;
    // schedule via RAF to keep the editor responsive during drags/transforms.
    scheduleBoundsUpdate()
  }, [imageDraggable, imageTx, rotation, scheduleBoundsUpdate])

  useEffect(() => {
    if (!src) return
    if (!img) return
    if (userChangedImageTxRef.current) return
    // Initial placement:
    // - wait until artboardWidthPx and artboardHeightPx are known
    // - width/height used ONLY for centering
    // - DO NOT change anything based on DPI
    if (!hasArtboard) return
    if (initialImageTransform) return
    if (appliedInitialTransformKeyRef.current === src) return

    const key = `${src}:${artW}x${artH}`
    if (placedKeyRef.current === key) return
    placedKeyRef.current = key

    queueMicrotask(() => {
      setRotation(0)
      setImageTx({ x: artW / 2, y: artH / 2, scaleX: 1, scaleY: 1 })
    })
  }, [artH, artW, hasArtboard, img, initialImageTransform, src])

  const commitTransform = useCallback(
    (tx: { x: number; y: number; scaleX: number; scaleY: number } | null, rotationDeg: number) => {
      if (!tx) return
      onImageTransformCommit?.({
        x: tx.x,
        y: tx.y,
        scaleX: tx.scaleX,
        scaleY: tx.scaleY,
        widthPx: img ? round4(img.width * tx.scaleX) : undefined,
        heightPx: img ? round4(img.height * tx.scaleY) : undefined,
        rotationDeg,
      })
    },
    [img, onImageTransformCommit]
  )

  const scheduleCommitTransform = useCallback(
    (tx: { x: number; y: number; scaleX: number; scaleY: number } | null, rotationDeg: number, delayMs = 150) => {
      pendingCommitRef.current = { tx, rot: rotationDeg }
      if (commitTimerRef.current != null) return
      commitTimerRef.current = window.setTimeout(() => {
        commitTimerRef.current = null
        const p = pendingCommitRef.current
        pendingCommitRef.current = null
        if (!p) return
        commitTransform(p.tx, p.rot)
      }, delayMs)
    },
    [commitTransform]
  )

  useEffect(() => {
    return () => {
      if (commitTimerRef.current != null) {
        window.clearTimeout(commitTimerRef.current)
        commitTimerRef.current = null
      }
      pendingCommitRef.current = null
    }
  }, [])

  const rotate90 = useCallback(() => {
    setRotation((r) => {
      const next = (r + 90) % 360
      // Persist rotation change (commit-on-action, not on every frame).
      scheduleCommitTransform(imageTxRef.current, next, 0)
      return next
    })
  }, [scheduleCommitTransform])

  const setImageSize = useCallback(
    (widthPx: number, heightPx: number) => {
      if (!img) return
      if (!hasArtboard) return
      const prev = imageTxRef.current
      if (!prev) return
      const w = Number(widthPx)
      const h = Number(heightPx)
      const nextScaleX = Number.isFinite(w) && w > 0 ? w / img.width : null
      const nextScaleY = Number.isFinite(h) && h > 0 ? h / img.height : null
      if (!nextScaleX && !nextScaleY) return

      const scaleX = nextScaleX ?? prev.scaleX
      const scaleY = nextScaleY ?? prev.scaleY
      if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY)) return
      const next = {
        x: prev.x,
        y: prev.y,
        scaleX,
        scaleY,
      }
      userChangedImageTxRef.current = true
      setImageTx(next)
      scheduleCommitTransform(next, rotationRef.current, 0)
    },
    [hasArtboard, img, scheduleCommitTransform]
  )

  const restoreImage = useCallback(() => {
    if (!img) return
    const t = initialImageTransform
    const next = t
      ? {
          x: Number(t.x),
          y: Number(t.y),
          scaleX: Number(t.scaleX),
          scaleY: Number(t.scaleY),
        }
      : (() => {
          if (!hasArtboard) return null
          return { x: artW / 2, y: artH / 2, scaleX: 1, scaleY: 1 }
        })()

    if (!next || !Number.isFinite(next.x) || !Number.isFinite(next.y) || !Number.isFinite(next.scaleX) || !Number.isFinite(next.scaleY)) return

    const nextRotation = t ? Number(t.rotationDeg) : 0
    const rot = Number.isFinite(nextRotation) ? nextRotation : 0
    setRotation(rot)
    userChangedImageTxRef.current = true
    setImageTx(next)
    scheduleCommitTransform(next, rot, 0)
    scheduleBoundsUpdate()
  }, [artH, artW, hasArtboard, img, initialImageTransform, scheduleBoundsUpdate, scheduleCommitTransform])

  const alignImage = useCallback(
    (opts: { x?: "left" | "center" | "right"; y?: "top" | "center" | "bottom" }) => {
      if (!hasArtboard) return
      const layer = layerRef.current
      const node = imageNodeRef.current
      if (!layer || !node) return

      const r = node.getClientRect({ relativeTo: layer })
      let dx = 0
      let dy = 0

      if (opts.x === "left") dx = 0 - r.x
      if (opts.x === "center") dx = artW / 2 - (r.x + r.width / 2)
      if (opts.x === "right") dx = artW - (r.x + r.width)

      if (opts.y === "top") dy = 0 - r.y
      if (opts.y === "center") dy = artH / 2 - (r.y + r.height / 2)
      if (opts.y === "bottom") dy = artH - (r.y + r.height)

      if (dx === 0 && dy === 0) return

      const prev = imageTxRef.current
      const baseX = prev?.x ?? node.x()
      const baseY = prev?.y ?? node.y()
      if (!prev) return
      const next = {
        x: baseX + dx,
        y: baseY + dy,
        scaleX: prev.scaleX,
        scaleY: prev.scaleY,
      }
      userChangedImageTxRef.current = true
      setImageTx(next)
      scheduleCommitTransform(next, rotationRef.current, 0)

      scheduleBoundsUpdate()
    },
    [artH, artW, hasArtboard, scheduleBoundsUpdate, scheduleCommitTransform]
  )

  useImperativeHandle(
    ref,
    () => ({ fitToView, zoomIn, zoomOut, rotate90, setImageSize, alignImage, restoreImage }),
    [alignImage, fitToView, restoreImage, rotate90, setImageSize, zoomIn, zoomOut]
  )

  const onWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault()
      // PX-WORLD invariant: no zooming (Stage scale stays 1).

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
    []
  )

  // E2E test hook: expose stage + image node to the browser so Playwright can
  // assert transforms without pixel-based screenshots.
  //
  // Use *getters* so the test always reads the latest refs (and we never clobber
  // state with transient null refs during React StrictMode mount cycles).
  const isE2E =
    process.env.NEXT_PUBLIC_E2E_TEST === "1" ||
    (typeof navigator !== "undefined" && Boolean((navigator as unknown as { webdriver?: boolean })?.webdriver))

  useEffect(() => {
    if (!isE2E) return
    const g = globalThis as unknown as {
      __gruf_editor?: { stage?: Konva.Stage | null; image?: Konva.Image | null }
    }
    g.__gruf_editor = {
      get stage() {
        return stageRef.current
      },
      get image() {
        return imageNodeRef.current
      },
    }
  }, [isE2E])

  return (
    <div
      ref={containerRef}
      className={`touch-none ${className ?? ""}`}
      aria-label={alt ?? "Canvas"}
      data-testid="editor-canvas-root"
    >
      <Stage
        ref={(n) => {
          stageRef.current = n
        }}
        width={size.w}
        height={size.h}
        pixelRatio={1}
        scaleX={1}
        scaleY={1}
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
          setView((v) => {
            const x = stage.x()
            const y = stage.y()
            if (v.x === x && v.y === y) return v
            return { ...v, x, y }
          })
        }}
        onWheel={onWheel}
      >
        <Layer
          ref={(n) => {
            layerRef.current = n
          }}
        >
          {drawArtboard ? <Rect x={0} y={0} width={artW} height={artH} fill="#ffffff" listening={false} /> : null}

          {img && imageTx ? (
            <KonvaImage
              ref={(n) => {
                imageNodeRef.current = n
              }}
              image={img}
              listening={imageDraggable}
              rotation={rotation}
              scaleX={imageTx.scaleX}
              scaleY={imageTx.scaleY}
              offsetX={img.width / 2}
              offsetY={img.height / 2}
              x={imageTx.x}
              y={imageTx.y}
              draggable={imageDraggable}
              onDragStart={() => {
                userInteractedRef.current = true
                // Mark as user-changed immediately, so a late `initialImageTransform`
                // cannot override state mid-drag.
                userChangedImageTxRef.current = true
                scheduleBoundsUpdate()
              }}
              onDragMove={() => {
                scheduleBoundsUpdate()
              }}
              onDragEnd={(e) => {
                const n = e.target
                const prev = imageTxRef.current
                const next = { x: n.x(), y: n.y(), scaleX: prev?.scaleX ?? 1, scaleY: prev?.scaleY ?? 1 }
                setImageTx(next)
                scheduleCommitTransform(next, rotationRef.current, 0)
              }}
            />
          ) : null}

          {/* Default selection frame (shown when the Select tool is active) */}
          {renderArtboard && imageDraggable && imageBounds ? (
            (() => {
              const x1 = snapWorldToDeviceHalfPixel(imageBounds.x, "x")
              const y1 = snapWorldToDeviceHalfPixel(imageBounds.y, "y")
              const x2 = snapWorldToDeviceHalfPixel(imageBounds.x + imageBounds.w, "x")
              const y2 = snapWorldToDeviceHalfPixel(imageBounds.y + imageBounds.h, "y")

                const handleW = selectionHandlePx
                const handleH = selectionHandlePx

              const toWorldFromScreen = (screen: number, axis: "x" | "y") => {
                const offset = axis === "x" ? view.x : view.y
                  return screen - offset
              }

              const handleAt = (screenX: number, screenY: number) => {
                // Center the handle around the corner point in *screen* space (constant px size),
                // then convert back to world coordinates.
                const left = Math.round(screenX - selectionHandlePx / 2)
                const top = Math.round(screenY - selectionHandlePx / 2)
                return { x: toWorldFromScreen(left, "x"), y: toWorldFromScreen(top, "y") }
              }

              // Corner screen coords (for pixel-snapped handle placement)
              const cornerTL = { x: view.x + x1 * view.scale, y: view.y + y1 * view.scale }
              const cornerTR = { x: view.x + x2 * view.scale, y: view.y + y1 * view.scale }
              const cornerBR = { x: view.x + x2 * view.scale, y: view.y + y2 * view.scale }
              const cornerBL = { x: view.x + x1 * view.scale, y: view.y + y2 * view.scale }

              const tl = handleAt(cornerTL.x, cornerTL.y)
              const tr = handleAt(cornerTR.x, cornerTR.y)
              const br = handleAt(cornerBR.x, cornerBR.y)
              const bl = handleAt(cornerBL.x, cornerBL.y)

              return (
                <>
                  <Line
                    points={[x1, y1, x2, y1]}
                    stroke={selectionColor}
                    strokeWidth={1}
                    dash={selectionDash}
                    strokeScaleEnabled={false}
                    listening={false}
                  />
                  <Line
                    points={[x2, y1, x2, y2]}
                    stroke={selectionColor}
                    strokeWidth={1}
                    dash={selectionDash}
                    strokeScaleEnabled={false}
                    listening={false}
                  />
                  <Line
                    points={[x2, y2, x1, y2]}
                    stroke={selectionColor}
                    strokeWidth={1}
                    dash={selectionDash}
                    strokeScaleEnabled={false}
                    listening={false}
                  />
                  <Line
                    points={[x1, y2, x1, y1]}
                    stroke={selectionColor}
                    strokeWidth={1}
                    dash={selectionDash}
                    strokeScaleEnabled={false}
                    listening={false}
                  />

                  {/* Corner handles */}
                  <Rect
                    x={tl.x}
                    y={tl.y}
                    width={handleW}
                    height={handleH}
                    fill="#ffffff"
                    stroke={selectionColor}
                    strokeWidth={1}
                    strokeScaleEnabled={false}
                    listening={false}
                  />
                  <Rect
                    x={tr.x}
                    y={tr.y}
                    width={handleW}
                    height={handleH}
                    fill="#ffffff"
                    stroke={selectionColor}
                    strokeWidth={1}
                    strokeScaleEnabled={false}
                    listening={false}
                  />
                  <Rect
                    x={br.x}
                    y={br.y}
                    width={handleW}
                    height={handleH}
                    fill="#ffffff"
                    stroke={selectionColor}
                    strokeWidth={1}
                    strokeScaleEnabled={false}
                    listening={false}
                  />
                  <Rect
                    x={bl.x}
                    y={bl.y}
                    width={handleW}
                    height={handleH}
                    fill="#ffffff"
                    stroke={selectionColor}
                    strokeWidth={1}
                    strokeScaleEnabled={false}
                    listening={false}
                  />
                </>
              )
            })()
          ) : null}

          {drawArtboard ? (
            <>
              {/* Artboard border as 4 independent lines (1px, not scaling) */}
              {(() => {
                const xL = snapWorldToDeviceHalfPixel(0, "x")
                const xR = snapWorldToDeviceHalfPixel(artW, "x")
                const yT = snapWorldToDeviceHalfPixel(0, "y")
                const yB = snapWorldToDeviceHalfPixel(artH, "y")

                return (
                  <>
                    <Line
                      points={[xL, 0, xL, artH]}
                      stroke={borderColor}
                      strokeWidth={borderWidth}
                      strokeScaleEnabled={false}
                      listening={false}
                    />
                    <Line
                      points={[xR, 0, xR, artH]}
                      stroke={borderColor}
                      strokeWidth={borderWidth}
                      strokeScaleEnabled={false}
                      listening={false}
                    />
                    <Line
                      points={[0, yT, artW, yT]}
                      stroke={borderColor}
                      strokeWidth={borderWidth}
                      strokeScaleEnabled={false}
                      listening={false}
                    />
                    <Line
                      points={[0, yB, artW, yB]}
                      stroke={borderColor}
                      strokeWidth={borderWidth}
                      strokeScaleEnabled={false}
                      listening={false}
                    />
                  </>
                )
              })()}
            </>
          ) : null}
        </Layer>
      </Stage>
    </div>
  )
})

