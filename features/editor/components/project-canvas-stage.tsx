"use client"

/**
 * Konva canvas stage for the project editor.
 *
 * Responsibilities:
 * - Render the artboard, grid, selection overlay, and image node.
 * - Delegate RAF/bounds/transform persistence to controller modules.
 */
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import { Image as KonvaImage, Layer, Line, Rect, Stage } from "react-konva"
import type Konva from "konva"

import { fitToWorld, panBy, zoomAround } from "@/lib/editor/canvas-model"
import { pxUToPxNumber } from "@/lib/editor/units"
import { numberToMicroPx } from "@/lib/editor/konva"
import { createBoundsController } from "./canvas-stage/bounds-controller"
import { computeGridLines } from "./canvas-stage/grid-lines"
import { pickIntrinsicSize, shouldApplyPersistedTransform } from "./canvas-stage/placement"
import { snapWorldToDeviceHalfPixel as snapHalfPixel } from "./canvas-stage/pixel-snap"
import { createRafScheduler, RAF_BOUNDS, RAF_DRAG_BOUNDS, RAF_PAN } from "./canvas-stage/raf-scheduler"
import { createTransformController } from "./canvas-stage/transform-controller"
import type { BoundsRect, ViewState } from "./canvas-stage/types"
import { useHtmlImage } from "./canvas-stage/use-html-image"
import { computeSelectionHandleRects, computeWorldSize } from "@/services/editor"

type Props = {
  src?: string
  activeImageId?: string | null
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
  /**
   * Intrinsic (source) image pixel dimensions from persisted metadata (DB).
   * This must be the canonical source of truth for initial sizing (not DOM layout).
   */
  intrinsicWidthPx?: number
  intrinsicHeightPx?: number
  grid?: {
    spacingXPx: number
    spacingYPx: number
    lineWidthPx: number
    color: string
  } | null
  onImageSizeChange?: (widthPxU: bigint, heightPxU: bigint) => void
  initialImageTransform?: {
    imageId?: string
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
  /**
   * Editor command surface (canonical).
   *
   * Invariants:
   * - All sizes/positions exposed by commands are **µpx** (`bigint`) where 1px = 1_000_000µpx.
   * - `setImageSize()` must be called with **positive** µpx values (0 or negative is ignored).
   * - Intrinsic (source) image dimensions must come from persisted metadata (`intrinsicWidthPx`/`intrinsicHeightPx`),
   *   never from DOM layout, to avoid drift across reloads.
   * - Persistence is driven via `onImageTransformCommit` and is expected to be RLS-safe and idempotent.
   */
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

const SelectionOverlay = memo(function SelectionOverlay({
  imageBounds,
  view,
  selectionHandlePx,
  selectionColor,
  selectionDash,
  snapWorldToDeviceHalfPixel,
}: {
  imageBounds: BoundsRect | null
  view: ViewState
  selectionHandlePx: number
  selectionColor: string
  selectionDash: number[] | undefined
  snapWorldToDeviceHalfPixel: (worldCoord: number, axis: "x" | "y") => number
}) {
  if (!imageBounds) return null
  const rects = computeSelectionHandleRects({
    bounds: { x: imageBounds.x, y: imageBounds.y, w: imageBounds.w, h: imageBounds.h },
    view: { x: view.x, y: view.y, scale: view.scale },
    handlePx: selectionHandlePx,
    snapWorldToDeviceHalfPixel,
  })
  const { x1, y1, x2, y2 } = rects.outline
  const { tl, tr, br, bl } = rects.handles
  const handleW = rects.handleSize.w
  const handleH = rects.handleSize.h

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
})

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
    activeImageId,
    alt,
    className,
    panEnabled = true,
    imageDraggable = false,
    fitPaddingPx = 24,
    renderArtboard = true,
    artboardWidthPx,
    artboardHeightPx,
    intrinsicWidthPx,
    intrinsicHeightPx,
    grid = null,
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
  const isE2E =
    process.env.NEXT_PUBLIC_E2E_TEST === "1" ||
    (typeof navigator !== "undefined" && Boolean((navigator as unknown as { webdriver?: boolean })?.webdriver))

  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState<ViewState>({ scale: 1, x: 0, y: 0 })
  const [rotation, setRotation] = useState(0)
  const [isDraggingImage, setIsDraggingImage] = useState(false)

  // Used to avoid re-running initial placement/fit logic unnecessarily.
  const placedKeyRef = useRef<string | null>(null)
  const appliedInitialTransformKeyRef = useRef<string | null>(null)
  const userInteractedRef = useRef(false)
  const userChangedImageTxRef = useRef(false)
  const autoFitKeyRef = useRef<string | null>(null)
  const transformControllerRef = useRef<ReturnType<typeof createTransformController> | null>(null)
  const imageDraggableRef = useRef(Boolean(imageDraggable))
  const isE2ERef = useRef(Boolean(isE2E))
  const onImageTransformCommitRef = useRef<Props["onImageTransformCommit"]>(onImageTransformCommit)

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
  const [imageBounds, setImageBounds] = useState<BoundsRect | null>(null)
  const rotationRef = useRef(0)
  useEffect(() => {
    rotationRef.current = rotation
  }, [rotation])

  useEffect(() => {
    imageTxRef.current = imageTx
  }, [imageTx])

  // Single RAF scheduler to batch pan/bounds work per frame.
  const panDeltaRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 })
  const onImageSizeChangeRef = useRef<Props["onImageSizeChange"]>(onImageSizeChange)
  const dragPosRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    onImageSizeChangeRef.current = onImageSizeChange
  }, [onImageSizeChange])

  useEffect(() => {
    imageDraggableRef.current = Boolean(imageDraggable)
  }, [imageDraggable])

  useEffect(() => {
    isE2ERef.current = Boolean(isE2E)
  }, [isE2E])

  useEffect(() => {
    onImageTransformCommitRef.current = onImageTransformCommit
  }, [onImageTransformCommit])

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
    // "World" size is used for view math (fit/pan/zoom). Prefer explicit artboard,
    // otherwise fall back to intrinsic image metadata (DB), and only then DOM image values.
    const intrinsic = pickIntrinsicSize({ intrinsicWidthPx, intrinsicHeightPx, img })
    return computeWorldSize({
      artboardWidthPx,
      artboardHeightPx,
      intrinsicWidthPx: intrinsic?.w,
      intrinsicHeightPx: intrinsic?.h,
      domWidthPx: img?.width,
      domHeightPx: img?.height,
    })
  }, [artboardHeightPx, artboardWidthPx, img, intrinsicHeightPx, intrinsicWidthPx])

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

  const gridLines = useMemo(() => {
    if (!drawArtboard) return null
    if (!grid) return null
    return computeGridLines({ artW, artH, grid, maxLines: 600 })
  }, [artH, artW, drawArtboard, grid])

  // Pixel-snap helper: for a 1px stroke, canvas looks crispest when the line center
  // lands on N + 0.5 device pixels in screen space.
  const snapWorldToDeviceHalfPixel = useCallback(
    (worldCoord: number, axis: "x" | "y") => {
      return snapHalfPixel({ worldCoord, axis, view: { scale: view.scale, x: view.x, y: view.y } })
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

  const boundsControllerRef = useRef<ReturnType<typeof createBoundsController> | null>(null)
  if (!boundsControllerRef.current) {
    boundsControllerRef.current = createBoundsController({
      imageDraggable: () => imageDraggableRef.current,
      isE2E: () => isE2ERef.current,
      rotationDeg: () => rotationRef.current,
      getLayer: () => layerRef.current,
      getImageNode: () => imageNodeRef.current,
      onBoundsChanged: (next) => setImageBounds(next as BoundsRect | null),
      onBoundsRead: () => {
        const g = globalThis as unknown as { __gruf_editor?: { boundsReads?: number } }
        if (g.__gruf_editor) g.__gruf_editor.boundsReads = (g.__gruf_editor.boundsReads ?? 0) + 1
      },
      onClientRectRead: () => {
        const g = globalThis as unknown as { __gruf_editor?: { clientRectReads?: number } }
        if (g.__gruf_editor) g.__gruf_editor.clientRectReads = (g.__gruf_editor.clientRectReads ?? 0) + 1
      },
    })
  }

  const updateImageBoundsFromNode = useCallback(() => {
    boundsControllerRef.current?.updateImageBoundsFromNode()
  }, [])

  const rafSchedulerRef = useRef<ReturnType<typeof createRafScheduler> | null>(null)
  if (!rafSchedulerRef.current) {
    rafSchedulerRef.current = createRafScheduler({
      onPan: () => {
        const { dx, dy } = panDeltaRef.current
        panDeltaRef.current = { dx: 0, dy: 0 }
        if (dx !== 0 || dy !== 0) setView((v) => panBy(v, dx, dy))
      },
      onDragBounds: () => {
        boundsControllerRef.current?.flushDragBounds()
      },
      onBounds: () => {
        updateImageBoundsFromNode()
      },
      onRafScheduled: () => {
        const g = globalThis as unknown as { __gruf_editor?: { rafScheduled?: number } }
        if (g.__gruf_editor) g.__gruf_editor.rafScheduled = (g.__gruf_editor.rafScheduled ?? 0) + 1
      },
      onRafExecuted: () => {
        const g = globalThis as unknown as { __gruf_editor?: { rafExecuted?: number } }
        if (g.__gruf_editor) g.__gruf_editor.rafExecuted = (g.__gruf_editor.rafExecuted ?? 0) + 1
      },
    })
  }
  const scheduleRaf = useCallback((flag: number) => rafSchedulerRef.current?.schedule(flag), [])
  const scheduleBoundsUpdate = useCallback(() => scheduleRaf(RAF_BOUNDS), [scheduleRaf])

  const updateBoundsDuringDragMove = useCallback(() => {
    const node = imageNodeRef.current
    if (!node) return
    if (rotationRef.current % 360 !== 0) {
      scheduleBoundsUpdate()
      return
    }
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

    boundsControllerRef.current?.accumulateDragDelta(dx, dy)
    scheduleRaf(RAF_DRAG_BOUNDS)
  }, [scheduleBoundsUpdate, scheduleRaf])

  // Apply persisted image state even if it arrives after initial placement.
  useEffect(() => {
    if (!img) return
    if (!src) return
    if (!initialImageTransform) return
    if (
      !shouldApplyPersistedTransform({
        src,
        appliedKey: appliedInitialTransformKeyRef.current,
        userChanged: userChangedImageTxRef.current,
        activeImageId,
        stateImageId: initialImageTransform.imageId,
        initialImageTransform,
      })
    )
      return

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
  }, [activeImageId, img, initialImageTransform, scheduleBoundsUpdate, src])

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
    const hasPersistedSize = Boolean(
      initialImageTransform?.widthPxU &&
      initialImageTransform?.heightPxU &&
      initialImageTransform?.imageId &&
      activeImageId &&
      initialImageTransform.imageId === activeImageId
    )
    if (hasPersistedSize) return
    if (appliedInitialTransformKeyRef.current === src) return

    const key = `${src}:${artW}x${artH}`
    if (placedKeyRef.current === key) return
    placedKeyRef.current = key

    const intrinsic = pickIntrinsicSize({ intrinsicWidthPx, intrinsicHeightPx, img })
    if (!intrinsic) return
    const baseW = intrinsic.w
    const baseH = intrinsic.h

    queueMicrotask(() => {
      setRotation(0)
      setImageTx({
        xPxU: numberToMicroPx(artW / 2),
        yPxU: numberToMicroPx(artH / 2),
        widthPxU: numberToMicroPx(baseW),
        heightPxU: numberToMicroPx(baseH),
      })
    })
  }, [activeImageId, artH, artW, hasArtboard, img, initialImageTransform, intrinsicHeightPx, intrinsicWidthPx, src])

  if (!transformControllerRef.current) {
    transformControllerRef.current = createTransformController({
      getImageNode: () => imageNodeRef.current,
      getLayer: () => layerRef.current,
      getRotationDeg: () => rotationRef.current,
      setRotationDeg: (deg) => setRotation(deg),
      getImageTx: () => imageTxRef.current,
      setImageTx: (next) => setImageTx(next),
      markUserChanged: () => {
        userChangedImageTxRef.current = true
      },
      onCommit: (t) => onImageTransformCommitRef.current?.(t),
    })
  }

  const scheduleCommitTransform = useCallback((commitPosition: boolean, delayMs = 150) => {
    transformControllerRef.current?.scheduleCommit(commitPosition, delayMs)
  }, [])

  useEffect(() => {
    return () => {
      transformControllerRef.current?.dispose()
      rafSchedulerRef.current?.dispose()
    }
  }, [])

  const rotate90 = useCallback(() => {
    transformControllerRef.current?.rotate90()
  }, [])

  const setImageSize = useCallback(
    (widthPxU: bigint, heightPxU: bigint) => {
      const center = hasArtboard ? { x: artW / 2, y: artH / 2 } : null
      transformControllerRef.current?.setImageSize(widthPxU, heightPxU, center)
    },
    [artW, artH, hasArtboard]
  )

  const restoreImage = useCallback(() => {
    if (!img) return
    const intrinsic = pickIntrinsicSize({ intrinsicWidthPx, intrinsicHeightPx, img })
    if (!intrinsic) return
    transformControllerRef.current?.restoreImage({
      artW,
      artH,
      baseW: intrinsic.w,
      baseH: intrinsic.h,
      initialImageTransform,
    })
    scheduleBoundsUpdate()
  }, [artH, artW, img, initialImageTransform, intrinsicHeightPx, intrinsicWidthPx, scheduleBoundsUpdate])

  const alignImage = useCallback(
    (opts: { x?: "left" | "center" | "right"; y?: "top" | "center" | "bottom" }) => {
      if (!hasArtboard) return
      transformControllerRef.current?.alignImage({ artW, artH, ...opts })
      scheduleBoundsUpdate()
    },
    [artH, artW, hasArtboard, scheduleBoundsUpdate]
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
      scheduleRaf(RAF_PAN)
    },
    [scheduleRaf]
  )

  // E2E test hook: expose stage + image node to the browser so Playwright can
  // assert transforms without pixel-based screenshots.
  //
  // Use *getters* so the test always reads the latest refs (and we never clobber
  // state with transient null refs during React StrictMode mount cycles).
  useEffect(() => {
    if (!isE2E) return
    const g = globalThis as unknown as {
      __gruf_editor?: {
        stage?: Konva.Stage | null
        image?: Konva.Image | null
        boundsReads?: number
        clientRectReads?: number
        rafScheduled?: number
        rafExecuted?: number
      }
    }
    g.__gruf_editor = {
      get stage() {
        return stageRef.current
      },
      get image() {
        return imageNodeRef.current
      },
      boundsReads: 0,
      clientRectReads: 0,
      rafScheduled: 0,
      rafExecuted: 0,
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
                setIsDraggingImage(true)
                scheduleBoundsUpdate()
              }}
              onDragMove={() => {
                updateBoundsDuringDragMove()
              }}
              onDragEnd={() => {
                userChangedImageTxRef.current = true
                scheduleCommitTransform(true, 0)
                dragPosRef.current = null
                setIsDraggingImage(false)
                scheduleBoundsUpdate()
              }}
            />
          ) : null}

          {/* Grid overlay (under selection frame). */}
          {gridLines && gridLines.lines.length ? (
            <>
              {gridLines.lines.map((l) => (
                <Line
                  key={l.key}
                  points={l.points}
                  stroke={gridLines.stroke}
                  strokeWidth={gridLines.strokeWidth}
                  strokeScaleEnabled={false}
                  listening={false}
                />
              ))}
            </>
          ) : null}

          {/* Default selection frame (shown when the Select tool is active) */}
          {renderArtboard && imageDraggable && !isDraggingImage ? (
            <SelectionOverlay
              imageBounds={imageBounds}
              view={view}
              selectionHandlePx={selectionHandlePx}
              selectionColor={selectionColor}
              selectionDash={selectionDash}
              snapWorldToDeviceHalfPixel={snapWorldToDeviceHalfPixel}
            />
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

