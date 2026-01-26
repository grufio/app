"use client"

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import { Image as KonvaImage, Layer, Line, Rect, Stage } from "react-konva"
import type Konva from "konva"

import { fitToWorld, panBy, zoomAround } from "@/lib/editor/canvas-model"
import { pxUToPxNumber } from "@/lib/editor/units"
import {
  applyMicroPxPositionToNode,
  applyMicroPxToNode,
  bakeInSizeToMicroPx,
  numberToMicroPx,
  readMicroPxPositionFromNode,
} from "@/lib/editor/konva"

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
  onImageSizeChange?: (widthPxU: bigint, heightPxU: bigint) => void
  initialImageTransform?: {
    xPxU?: bigint
    yPxU?: bigint
    widthPxU?: bigint
    heightPxU?: bigint
    rotationDeg: number
  } | null
  onImageTransformCommit?: (t: {
    xPxU?: bigint
    yPxU?: bigint
    widthPxU: bigint
    heightPxU: bigint
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
  setImageSize: (widthPxU: bigint, heightPxU: bigint) => void
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
    fitPaddingPx = 24,
    renderArtboard = true,
    artboardWidthPx,
    artboardHeightPx,
    onImageSizeChange,
    initialImageTransform,
    onImageTransformCommit,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<Konva.Stage | null>(null)
  const layerRef = useRef<Konva.Layer | null>(null)
  const imageNodeRef = useRef<Konva.Image | null>(null)
  const img = useHtmlImage(src ?? null)

  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 })
  const [rotation, setRotation] = useState(0)

  // Used to avoid re-running initial placement/fit logic unnecessarily.
  const placedKeyRef = useRef<string | null>(null)
  const appliedInitialTransformKeyRef = useRef<string | null>(null)
  const userInteractedRef = useRef(false)
  const userChangedImageTxRef = useRef(false)
  const autoFitKeyRef = useRef<string | null>(null)
  const commitTimerRef = useRef<number | null>(null)
  const pendingCommitRef = useRef<{ commitPosition: boolean } | null>(null)

  const [imageTx, setImageTx] = useState<{
    xPxU: bigint
    yPxU: bigint
    widthPxU: bigint
    heightPxU: bigint
  } | null>(null)
  const imageTxRef = useRef<{
    xPxU: bigint
    yPxU: bigint
    widthPxU: bigint
    heightPxU: bigint
  } | null>(null)
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
  const dragPosRef = useRef<{ x: number; y: number } | null>(null)

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
  const fitPadding = Math.max(0, Number(fitPaddingPx) || 0)

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

  const fitToView = useCallback(() => {
    if (!world) return
    if (size.w <= 0 || size.h <= 0) return
    userInteractedRef.current = false
    autoFitKeyRef.current = null
    setView(fitToWorld(size, world, fitPadding))
  }, [fitPadding, size, world])

  const zoomIn = useCallback(() => {
    const pointer = { x: size.w / 2, y: size.h / 2 }
    userInteractedRef.current = true
    setView((v) => zoomAround(v, pointer, 1.1, 0.05, 8))
  }, [size.h, size.w])

  const zoomOut = useCallback(() => {
    const pointer = { x: size.w / 2, y: size.h / 2 }
    userInteractedRef.current = true
    setView((v) => zoomAround(v, pointer, 1 / 1.1, 0.05, 8))
  }, [size.h, size.w])

  // Auto-fit view once the artboard + container dimensions are known.
  useEffect(() => {
    if (!hasArtboard) return
    if (!world) return
    if (size.w <= 0 || size.h <= 0) return
    if (userInteractedRef.current) return

    const key = `${size.w}x${size.h}:${world.w}x${world.h}:p${fitPadding}`
    if (autoFitKeyRef.current === key) return
    autoFitKeyRef.current = key
    setView(fitToWorld(size, world, fitPadding))
  }, [fitPadding, hasArtboard, size, world])

  const reportImageSize = useCallback((tx: { widthPxU: bigint; heightPxU: bigint } | null) => {
    if (!tx) return
    onImageSizeChangeRef.current?.(tx.widthPxU, tx.heightPxU)
  }, [])

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

  const updateBoundsDuringDragMove = useCallback(() => {
    const node = imageNodeRef.current
    if (!node) return
    const prevPos = dragPosRef.current
    const nextPos = { x: node.x(), y: node.y() }
    dragPosRef.current = nextPos

    if (!prevPos) {
      scheduleBoundsUpdate()
      return
    }

    const dx = nextPos.x - prevPos.x
    const dy = nextPos.y - prevPos.y
    if (dx === 0 && dy === 0) return

    // Drag is a pure translation. The axis-aligned bounds translate 1:1 with the node.
    // Avoid calling getClientRect() on every move.
    setImageBounds((prev) => {
      if (!prev) return prev
      return { x: prev.x + dx, y: prev.y + dy, w: prev.w, h: prev.h }
    })
  }, [scheduleBoundsUpdate])

  // Apply persisted image state even if it arrives after initial placement.
  useEffect(() => {
    if (!img) return
    if (!src) return
    if (!initialImageTransform) return
    if (userChangedImageTxRef.current) return
    if (appliedInitialTransformKeyRef.current === src) return

    const rotationDeg = Number(initialImageTransform.rotationDeg)
    const nextWidthPxU = initialImageTransform.widthPxU
    const nextHeightPxU = initialImageTransform.heightPxU
    // Hard requirement: persisted state must include canonical µpx size.
    if (!nextWidthPxU || !nextHeightPxU) return

    const xPxU = initialImageTransform.xPxU ?? 0n
    const yPxU = initialImageTransform.yPxU ?? 0n

    appliedInitialTransformKeyRef.current = src
    queueMicrotask(() => {
      setRotation(Number.isFinite(rotationDeg) ? rotationDeg : 0)
      setImageTx({ xPxU, yPxU, widthPxU: nextWidthPxU, heightPxU: nextHeightPxU })
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
      setImageTx({
        xPxU: numberToMicroPx(artW / 2),
        yPxU: numberToMicroPx(artH / 2),
        widthPxU: numberToMicroPx(img.width),
        heightPxU: numberToMicroPx(img.height),
      })
    })
  }, [artH, artW, hasArtboard, img, initialImageTransform, src])

  const commitFromNode = useCallback(
    (commitPosition: boolean) => {
      const node = imageNodeRef.current
      if (!node) return
      const baked = bakeInSizeToMicroPx(node)

      const rotationDeg = rotationRef.current
      const pos = commitPosition ? readMicroPxPositionFromNode(node) : null
      const xPxU = commitPosition ? pos?.xPxU : imageTxRef.current?.xPxU
      const yPxU = commitPosition ? pos?.yPxU : imageTxRef.current?.yPxU

      const next = {
        xPxU: xPxU ?? 0n,
        yPxU: yPxU ?? 0n,
        widthPxU: baked.widthPxU,
        heightPxU: baked.heightPxU,
      }

      setImageTx(next)

      onImageTransformCommit?.({
        xPxU: commitPosition ? next.xPxU : undefined,
        yPxU: commitPosition ? next.yPxU : undefined,
        widthPxU: next.widthPxU,
        heightPxU: next.heightPxU,
        rotationDeg,
      })
    },
    [onImageTransformCommit]
  )

  const scheduleCommitTransform = useCallback(
    (commitPosition: boolean, delayMs = 150) => {
      pendingCommitRef.current = { commitPosition }
      if (commitTimerRef.current != null) return
      commitTimerRef.current = window.setTimeout(() => {
        commitTimerRef.current = null
        const p = pendingCommitRef.current
        pendingCommitRef.current = null
        if (!p) return
        commitFromNode(p.commitPosition)
      }, delayMs)
    },
    [commitFromNode]
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
      scheduleCommitTransform(false, 0)
      return next
    })
  }, [scheduleCommitTransform])

  const setImageSize = useCallback(
    (widthPxU: bigint, heightPxU: bigint) => {
      if (!img) return
      if (!hasArtboard) return
      const prev = imageTxRef.current
      if (!prev) return
      if (widthPxU <= 0n || heightPxU <= 0n) return

      const next = {
        xPxU: prev.xPxU,
        yPxU: prev.yPxU,
        widthPxU,
        heightPxU,
      }
      const node = imageNodeRef.current
      if (node) {
        applyMicroPxToNode(node, widthPxU, heightPxU)
      }
      userChangedImageTxRef.current = true
      setImageTx(next)
      scheduleCommitTransform(false, 0)
    },
    [hasArtboard, img, scheduleCommitTransform]
  )

  const restoreImage = useCallback(() => {
    if (!img) return
    const t = initialImageTransform
    const nextWidthPxU = t?.widthPxU ?? numberToMicroPx(img.width)
    const nextHeightPxU = t?.heightPxU ?? numberToMicroPx(img.height)
    const nextX = t?.xPxU ?? numberToMicroPx(artW / 2)
    const nextY = t?.yPxU ?? numberToMicroPx(artH / 2)

    const next = {
      xPxU: nextX,
      yPxU: nextY,
      widthPxU: nextWidthPxU,
      heightPxU: nextHeightPxU,
    }

    const nextRotation = t ? Number(t.rotationDeg) : 0
    const rot = Number.isFinite(nextRotation) ? nextRotation : 0
    setRotation(rot)
    const node = imageNodeRef.current
    if (node) {
      applyMicroPxToNode(node, nextWidthPxU, nextHeightPxU)
      applyMicroPxPositionToNode(node, nextX, nextY)
    }
    userChangedImageTxRef.current = true
    setImageTx(next)
    scheduleCommitTransform(true, 0)
    scheduleBoundsUpdate()
  }, [artH, artW, img, initialImageTransform, scheduleBoundsUpdate, scheduleCommitTransform])

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
      const baseX = prev ? pxUToPxNumber(prev.xPxU) : node.x()
      const baseY = prev ? pxUToPxNumber(prev.yPxU) : node.y()
      if (!prev) return
      const next = {
        xPxU: numberToMicroPx(baseX + dx),
        yPxU: numberToMicroPx(baseY + dy),
        widthPxU: prev.widthPxU,
        heightPxU: prev.heightPxU,
      }
      node.x(baseX + dx)
      node.y(baseY + dy)
      userChangedImageTxRef.current = true
      setImageTx(next)
      scheduleCommitTransform(true, 0)

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
      const stage = stageRef.current
      if (!stage) return

      // Illustrator-like:
      // - wheel: pan
      // - ctrl/cmd + wheel: zoom around cursor
      if (e.evt.ctrlKey || e.evt.metaKey) {
        userInteractedRef.current = true
        const pos = stage.getPointerPosition()
        if (!pos) return
        const factor = Math.pow(1.0015, -e.evt.deltaY)
        setView((v) => zoomAround(v, { x: pos.x, y: pos.y }, factor, 0.05, 8))
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

  const imageRender = useMemo(() => {
    if (!img || !imageTx) return null
    const width = pxUToPxNumber(imageTx.widthPxU)
    const height = pxUToPxNumber(imageTx.heightPxU)
    const x = pxUToPxNumber(imageTx.xPxU)
    const y = pxUToPxNumber(imageTx.yPxU)
    return { width, height, x, y }
  }, [img, imageTx])

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
          {drawArtboard ? <Rect x={0} y={0} width={artW} height={artH} fill="#ffffff" listening={false} /> : null}

          {img && imageTx && imageRender ? (
            <KonvaImage
              ref={(n) => {
                imageNodeRef.current = n
              }}
              image={img}
              listening={imageDraggable}
              rotation={rotation}
              width={imageRender.width}
              height={imageRender.height}
              scaleX={1}
              scaleY={1}
              offsetX={imageRender.width / 2}
              offsetY={imageRender.height / 2}
              x={imageRender.x}
              y={imageRender.y}
              draggable={imageDraggable}
              onDragStart={() => {
                userInteractedRef.current = true
                // Mark as user-changed immediately, so a late `initialImageTransform`
                // cannot override state mid-drag.
                userChangedImageTxRef.current = true
                const node = imageNodeRef.current
                dragPosRef.current = node ? { x: node.x(), y: node.y() } : null
                scheduleBoundsUpdate()
              }}
              onDragMove={() => {
                updateBoundsDuringDragMove()
              }}
              onDragEnd={() => {
                userChangedImageTxRef.current = true
                scheduleCommitTransform(true, 0)
                dragPosRef.current = null
                scheduleBoundsUpdate()
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
                const scale = view.scale || 1
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

