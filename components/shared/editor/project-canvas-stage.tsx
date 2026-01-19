"use client"

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import { Image as KonvaImage, Layer, Line, Rect, Stage } from "react-konva"
import type Konva from "konva"

import { fitToWorld, panBy, zoomAround } from "@/lib/editor/canvas-model"

type Props = {
  src: string
  alt?: string
  className?: string
  panEnabled?: boolean
  imageDraggable?: boolean
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
  const img = useHtmlImage(src)

  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 })
  const [rotation, setRotation] = useState(0)

  const lastAutoFitKeyRef = useRef<string | null>(null)
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

  const showArtboard = Boolean(world && artboardWidthPx && artboardHeightPx)
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
      const scale = view.scale || 1
      const offset = axis === "x" ? view.x : view.y
      const screen = offset + worldCoord * scale
      const snapped = Math.round(screen - 0.5) + 0.5
      return (snapped - offset) / scale
    },
    [view.scale, view.x, view.y]
  )

  const fit = useMemo(() => {
    if (!world || size.w === 0 || size.h === 0) return null
    // For initial fit / "fit to view" action: keep a 32px padding around the artboard.
    // This is not enforced during user interactions (pan/zoom).
    return fitToWorld(size, world, 32)
  }, [size, world])

  useEffect(() => {
    if (!fit || !img || !world) return
    if (userInteractedRef.current) return
    const key = `${src}:${world.w}x${world.h}`
    if (lastAutoFitKeyRef.current === key) return
    lastAutoFitKeyRef.current = key
    queueMicrotask(() => setView({ scale: fit.scale, x: fit.x, y: fit.y }))
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

  // Apply persisted image state even if it arrives after the initial placement.
  // Without this, a late `initialImageTransform` gets ignored (because we only "place" once per `src`),
  // which makes the image re-open at the default "fit to artboard" size.
  useEffect(() => {
    if (!img) return
    if (!src) return
    if (!initialImageTransform) return
    if (userChangedImageTxRef.current) return
    if (appliedInitialTransformKeyRef.current === src) return

    appliedInitialTransformKeyRef.current = src
    queueMicrotask(() => {
      setRotation(initialImageTransform.rotationDeg || 0)
      const wPx = Number(initialImageTransform.widthPx)
      const hPx = Number(initialImageTransform.heightPx)
      const scaleX =
        Number.isFinite(wPx) && wPx > 0 && img.width > 0 ? wPx / img.width : Number(initialImageTransform.scaleX) || 1
      const scaleY =
        Number.isFinite(hPx) && hPx > 0 && img.height > 0
          ? hPx / img.height
          : Number(initialImageTransform.scaleY) || 1
      setImageTx({
        x: initialImageTransform.x,
        y: initialImageTransform.y,
        scaleX,
        scaleY,
      })
      scheduleBoundsUpdate()
    })
  }, [img, initialImageTransform, scheduleBoundsUpdate, src])

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
    const key = src
    if (placedKeyRef.current === key) return
    placedKeyRef.current = key
    appliedInitialTransformKeyRef.current = null
    userChangedImageTxRef.current = false
    if (initialImageTransform) {
      appliedInitialTransformKeyRef.current = key
      queueMicrotask(() => {
        setRotation(initialImageTransform.rotationDeg || 0)
        const wPx = Number(initialImageTransform.widthPx)
        const hPx = Number(initialImageTransform.heightPx)
        const scaleX =
          Number.isFinite(wPx) && wPx > 0 && img.width > 0 ? wPx / img.width : Number(initialImageTransform.scaleX) || 1
        const scaleY =
          Number.isFinite(hPx) && hPx > 0 && img.height > 0
            ? hPx / img.height
            : Number(initialImageTransform.scaleY) || 1
        setImageTx({
          x: initialImageTransform.x,
          y: initialImageTransform.y,
          scaleX,
          scaleY,
        })
      })
      return
    }
    const initialScale =
      showArtboard && artW > 0 && artH > 0 ? Math.min(artW / img.width, artH / img.height) : 1
    const x = showArtboard ? artW / 2 : img.width / 2
    const y = showArtboard ? artH / 2 : img.height / 2
    queueMicrotask(() => {
      setRotation(0)
      setImageTx({ x, y, scaleX: initialScale, scaleY: initialScale })
    })
  }, [artH, artW, img, initialImageTransform, reportImageSize, showArtboard, src])

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
      const w = Number(widthPx)
      const h = Number(heightPx)
      const nextScaleX = Number.isFinite(w) && w > 0 ? w / img.width : null
      const nextScaleY = Number.isFinite(h) && h > 0 ? h / img.height : null
      if (!nextScaleX && !nextScaleY) return

      const prev = imageTxRef.current
      const next = {
        x: prev?.x ?? (showArtboard ? artW / 2 : img.width / 2),
        y: prev?.y ?? (showArtboard ? artH / 2 : img.height / 2),
        scaleX: nextScaleX ?? prev?.scaleX ?? 1,
        scaleY: nextScaleY ?? prev?.scaleY ?? 1,
      }
      userChangedImageTxRef.current = true
      setImageTx(next)
      scheduleCommitTransform(next, rotationRef.current, 0)
    },
    [artH, artW, img, scheduleCommitTransform, showArtboard]
  )

  const restoreImage = useCallback(() => {
    if (!img) return
    // Restore original placement (like initial "copy" state):
    // - reset rotation
    // - fit into current artboard and center
    setRotation(0)
    const initialScale = showArtboard && artW > 0 && artH > 0 ? Math.min(artW / img.width, artH / img.height) : 1
    const x = showArtboard ? artW / 2 : img.width / 2
    const y = showArtboard ? artH / 2 : img.height / 2
    const next = { x, y, scaleX: initialScale, scaleY: initialScale }
    userChangedImageTxRef.current = true
    setImageTx(next)
    scheduleCommitTransform(next, 0, 0)
    scheduleBoundsUpdate()
  }, [artH, artW, img, scheduleBoundsUpdate, scheduleCommitTransform, showArtboard])

  const alignImage = useCallback(
    (opts: { x?: "left" | "center" | "right"; y?: "top" | "center" | "bottom" }) => {
      if (!showArtboard) return
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
      const next = {
        x: baseX + dx,
        y: baseY + dy,
        scaleX: prev?.scaleX ?? node.scaleX() ?? 1,
        scaleY: prev?.scaleY ?? node.scaleY() ?? 1,
      }
      userChangedImageTxRef.current = true
      setImageTx(next)
      scheduleCommitTransform(next, rotationRef.current, 0)

      scheduleBoundsUpdate()
    },
    [artH, artW, scheduleBoundsUpdate, scheduleCommitTransform, showArtboard]
  )

  useImperativeHandle(
    ref,
    () => ({ fitToView, zoomIn, zoomOut, rotate90, setImageSize, alignImage, restoreImage }),
    [alignImage, fitToView, restoreImage, rotate90, setImageSize, zoomIn, zoomOut]
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

  if (!src) return null

  return (
    <div
      ref={containerRef}
      className={`touch-none ${className ?? ""}`}
      aria-label={alt}
      data-testid="editor-canvas-root"
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
          {showArtboard ? (
            <Rect x={0} y={0} width={artW} height={artH} fill="#ffffff" listening={false} />
          ) : null}

          {img ? (
            <KonvaImage
              ref={(n) => {
                imageNodeRef.current = n
              }}
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
          {imageDraggable && imageBounds ? (
            (() => {
              const x1 = snapWorldToDeviceHalfPixel(imageBounds.x, "x")
              const y1 = snapWorldToDeviceHalfPixel(imageBounds.y, "y")
              const x2 = snapWorldToDeviceHalfPixel(imageBounds.x + imageBounds.w, "x")
              const y2 = snapWorldToDeviceHalfPixel(imageBounds.y + imageBounds.h, "y")

              const handleW = selectionHandlePx / (view.scale || 1)
              const handleH = selectionHandlePx / (view.scale || 1)

              const toWorldFromScreen = (screen: number, axis: "x" | "y") => {
                const scale = view.scale || 1
                const offset = axis === "x" ? view.x : view.y
                return (screen - offset) / scale
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

          {showArtboard ? (
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

