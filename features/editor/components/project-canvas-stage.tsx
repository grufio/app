"use client"

/**
 * Konva canvas stage for the project editor.
 *
 * Responsibilities:
 * - Render the artboard, grid, selection overlay, and image node.
 * - Delegate RAF/bounds/transform persistence to controller modules.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import type Konva from "konva"

import { panBy, zoomAround } from "@/lib/editor/canvas-model"
import { pxUToPxNumber } from "@/lib/editor/units"
import { useAlignImageController, type AlignImageOptions } from "./canvas-stage/align-controller"
import { createBoundsController } from "./canvas-stage/bounds-controller"
import { computeGridLines } from "./canvas-stage/grid-lines"
import { pickIntrinsicSize } from "./canvas-stage/placement"
import { createStateSyncGuard } from "./canvas-stage/state-sync-guard"
import { snapWorldToDeviceHalfPixel as snapHalfPixel } from "./canvas-stage/pixel-snap"
import { createRafScheduler, RAF_BOUNDS, RAF_DRAG_BOUNDS, RAF_PAN, RAF_ZOOM } from "./canvas-stage/raf-scheduler"
import { useRestoreImageController, type RestoreBaseSpec, type RestoreImageResult } from "./canvas-stage/restore-controller"
import { useCropController, type CropRectWorld } from "./canvas-stage/crop-controller"
import { useSelectResizeController } from "./canvas-stage/select-controller"
import { useResizeListenerLifecycle } from "./canvas-stage/stage-lifecycle-controller"
import { createTransformController } from "./canvas-stage/transform-controller"
import { computeSelectionRects } from "./canvas-stage/selection-rects"
import { computeSnappedGridLines } from "./canvas-stage/snapped-grid-lines"
import type { BoundsRect } from "./canvas-stage/types"
import { useHtmlImage } from "./canvas-stage/use-html-image"
import { computeWorldSize } from "@/services/editor"
import { useStageViewController } from "./canvas-stage/use-stage-view-controller"
import { useImagePlacementSync } from "./canvas-stage/use-image-placement-sync"
import { CanvasStageScene } from "./canvas-stage/canvas-stage-scene"

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
  /** Canonical restore baseline from initial upload master image. */
  restoreBaseImageId?: string | null
  restoreBaseWidthPx?: number
  restoreBaseHeightPx?: number
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
  cropEnabled?: boolean
  onCropDblClick?: () => void
  cropBusy?: boolean
  /** Global guard for rotate mutations (e.g. locked image). */
  rotateEnabled?: boolean
  /** Global guard for all image mutations (resize/align/restore/rotate). */
  mutationsEnabled?: boolean
  /** Clip image/overlays to artboard bounds. */
  clipToArtboard?: boolean
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
  alignImage: (opts: AlignImageOptions) => void
  /**
   * Restore the "working copy" state of the image back to its original placement.
   * This resets rotation and re-fits the image into the current artboard.
   */
  restoreImage: () => RestoreImageResult
  getCropSelection: () =>
    | { ok: true; rect: { x: number; y: number; w: number; h: number } }
    | { ok: false; reason: "crop_disabled" | "not_ready" | "rotated" | "invalid_intrinsic" }
  /** Returns current crop selection in source-image pixels. */
  getCropSelectionPx: () => { x: number; y: number; w: number; h: number } | null
  /** Resets in-canvas crop selection to full current image bounds. */
  resetCropSelection: () => void
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
    restoreBaseImageId,
    restoreBaseWidthPx,
    restoreBaseHeightPx,
    grid = null,
    onImageSizeChange,
    initialImageTransform,
    onImageTransformCommit,
    onCropDblClick,
    cropEnabled = false,
    cropBusy = false,
    rotateEnabled = true,
    mutationsEnabled = true,
    clipToArtboard = false,
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

  const [rotation, setRotation] = useState(0)
  const [isDraggingImage, setIsDraggingImage] = useState(false)

  // Used to avoid re-running initial placement/fit logic unnecessarily.
  const placedKeyRef = useRef<string | null>(null)
  const userInteractedRef = useRef(false)
  const stateSyncGuardRef = useRef(createStateSyncGuard())
  const autoFitKeyRef = useRef<string | null>(null)
  const transformControllerRef = useRef<ReturnType<typeof createTransformController> | null>(null)
  const imageDraggableRef = useRef(Boolean(imageDraggable))
  const isE2ERef = useRef(Boolean(isE2E))
  const onImageTransformCommitRef = useRef<Props["onImageTransformCommit"]>(onImageTransformCommit)
  const restoreBaseSpecRef = useRef<RestoreBaseSpec | null>(null)

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
  const zoomRef = useRef<{ factor: number; x: number; y: number } | null>(null)
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

  const markUserChanged = useCallback(() => {
    stateSyncGuardRef.current.markUserChanged()
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
  const shouldClipToArtboard = clipToArtboard && hasArtboard
  const artW = world?.w ?? 0
  const artH = world?.h ?? 0
  const borderColor = "#000000"
  const borderWidth = 1
  const selectionColor = "#000000"
  const selectionDash: number[] | undefined = undefined
  const selectionHandlePx = 8
  const fitPadding = Math.max(0, Number(fitPaddingPx) || 0)
  const {
    size,
    view,
    setView,
    stagePixelRatio,
    fitToView,
    zoomIn,
    zoomOut,
    onWheel,
    onStageDragStart,
    onStageDragEnd,
  } = useStageViewController({
    containerRef,
    stageRef,
    world,
    fitPadding,
    hasArtboard,
    userInteractedRef,
    autoFitKeyRef,
    panDeltaRef,
    zoomRef,
    schedulePanRaf: () => scheduleRaf(RAF_PAN),
    scheduleZoomRaf: () => scheduleRaf(RAF_ZOOM),
  })

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
  const snappedGridLines = useMemo(() => {
    return computeSnappedGridLines({
      gridLines,
      snapWorldToDeviceHalfPixel,
    })
  }, [gridLines, snapWorldToDeviceHalfPixel])
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
      onZoom: () => {
        const zoom = zoomRef.current
        zoomRef.current = null
        if (!zoom) return
        if (!Number.isFinite(zoom.factor) || zoom.factor === 1) return
        setView((v) => zoomAround(v, { x: zoom.x, y: zoom.y }, zoom.factor, 0.05, 8))
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

  useImagePlacementSync({
    src,
    img,
    activeImageId,
    hasArtboard,
    artW,
    artH,
    initialImageTransform,
    intrinsicWidthPx,
    intrinsicHeightPx,
    restoreBaseImageId,
    restoreBaseWidthPx,
    restoreBaseHeightPx,
    stateSyncGuardRef,
    placedKeyRef,
    restoreBaseSpecRef,
    scheduleBoundsUpdate,
    setRotation,
    setImageTx,
  })

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

  if (!transformControllerRef.current) {
    transformControllerRef.current = createTransformController({
      getImageNode: () => imageNodeRef.current,
      getLayer: () => layerRef.current,
      getRotationDeg: () => rotationRef.current,
      setRotationDeg: (deg) => setRotation(deg),
      getImageTx: () => imageTxRef.current,
      setImageTx: (next) => setImageTx(next),
      markUserChanged,
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
    if (!mutationsEnabled || !rotateEnabled) return
    transformControllerRef.current?.rotate90()
  }, [mutationsEnabled, rotateEnabled])

  const setImageSize = useCallback(
    (widthPxU: bigint, heightPxU: bigint) => {
      if (!mutationsEnabled) return
      const center = hasArtboard ? { x: artW / 2, y: artH / 2 } : null
      transformControllerRef.current?.setImageSize(widthPxU, heightPxU, center)
    },
    [artW, artH, hasArtboard, mutationsEnabled]
  )

  const restoreImageRaw = useRestoreImageController({
    artW,
    artH,
    restoreBaseSpecRef,
    activeImageId,
    initialImageTransform,
    transformControllerRef,
    scheduleBoundsUpdate,
  })
  const restoreImage = useCallback(() => {
    if (!mutationsEnabled) return { ok: false as const, reason: "not_ready" as const }
    return restoreImageRaw()
  }, [mutationsEnabled, restoreImageRaw])

  const alignImageRaw = useAlignImageController({
    artW,
    artH,
    hasArtboard,
    transformControllerRef,
    scheduleBoundsUpdate,
  })
  const alignImage = useCallback(
    (opts: AlignImageOptions) => {
      if (!mutationsEnabled) return
      alignImageRaw(opts)
    },
    [alignImageRaw, mutationsEnabled]
  )

  const imageRender = useMemo(() => {
    if (!img || !imageTx) return null
    const width = pxUToPxNumber(imageTx.widthPxU)
    const height = pxUToPxNumber(imageTx.heightPxU)
    const x = pxUToPxNumber(imageTx.xPxU)
    const y = pxUToPxNumber(imageTx.yPxU)
    return { width, height, x, y }
  }, [img, imageTx])

  const imageFrame = useMemo<CropRectWorld | null>(() => {
    if (!imageRender) return null
    return {
      x: imageRender.x - imageRender.width / 2,
      y: imageRender.y - imageRender.height / 2,
      w: imageRender.width,
      h: imageRender.height,
    }
  }, [imageRender])

  const cropMinSize = 10
  const cropLimitFrame = hasArtboard ? { x: 0, y: 0, w: artW, h: artH } : imageFrame
  const { beginSelectResize, stopSelectResize } = useSelectResizeController({
    containerRef,
    view,
    setImageTx,
    markUserChanged,
    scheduleBoundsUpdate,
    scheduleCommitTransform,
  })

  const { cropRect, applyCropMove, beginCropResize, getCropSelection, getCropSelectionPx, resetCropSelection, stopCropResize } =
    useCropController({
    cropEnabled,
    view,
    containerRef,
    imageFrame,
    cropMinSize,
    cropLimitFrame,
    intrinsicWidthPx,
    intrinsicHeightPx,
    imageRender: imageRender ? { w: imageRender.width, h: imageRender.height } : null,
    rotation,
    })

  useResizeListenerLifecycle({
    cropBusy,
    cropEnabled,
    imageDraggable,
    panEnabled,
    stopSelectResize,
    stopCropResize,
  })

  const cropRects = useMemo(() => {
    return computeSelectionRects({
      frame: cropRect ? { x: cropRect.x, y: cropRect.y, w: cropRect.w, h: cropRect.h } : null,
      view: { x: view.x, y: view.y, scale: view.scale },
      handlePx: selectionHandlePx,
      snapWorldToDeviceHalfPixel,
    })
  }, [cropRect, selectionHandlePx, snapWorldToDeviceHalfPixel, view.scale, view.x, view.y])

  const selectRects = useMemo(() => {
    return computeSelectionRects({
      frame: imageFrame ? { x: imageFrame.x, y: imageFrame.y, w: imageFrame.w, h: imageFrame.h } : null,
      view: { x: view.x, y: view.y, scale: view.scale },
      handlePx: selectionHandlePx,
      snapWorldToDeviceHalfPixel,
    })
  }, [imageFrame, selectionHandlePx, snapWorldToDeviceHalfPixel, view.scale, view.x, view.y])

  useImperativeHandle(
    ref,
    () => ({
      fitToView,
      zoomIn,
      zoomOut,
      rotate90,
      setImageSize,
      alignImage,
      restoreImage,
      getCropSelection,
      getCropSelectionPx,
      resetCropSelection,
    }),
    [alignImage, fitToView, getCropSelection, getCropSelectionPx, resetCropSelection, restoreImage, rotate90, setImageSize, zoomIn, zoomOut]
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

  return (
    <CanvasStageScene
      containerRef={containerRef}
      stageRef={stageRef}
      layerRef={layerRef}
      imageNodeRef={imageNodeRef}
      className={className}
      alt={alt}
      size={size}
      stagePixelRatio={stagePixelRatio}
      view={view}
      panEnabled={panEnabled}
      onStageDragStart={onStageDragStart}
      onStageDragEnd={onStageDragEnd}
      onWheel={onWheel}
      drawArtboard={drawArtboard}
      artW={artW}
      artH={artH}
      shouldClipToArtboard={shouldClipToArtboard}
      img={img}
      imageTx={imageTx}
      imageRender={imageRender}
      imageDraggable={imageDraggable}
      rotation={rotation}
      onImageDragInteraction={() => {
        userInteractedRef.current = true
      }}
      markUserChanged={markUserChanged}
      dragPosRef={dragPosRef}
      setIsDraggingImage={setIsDraggingImage}
      scheduleBoundsUpdate={scheduleBoundsUpdate}
      updateBoundsDuringDragMove={updateBoundsDuringDragMove}
      scheduleCommitTransform={scheduleCommitTransform}
      snappedGridLines={snappedGridLines}
      renderArtboard={renderArtboard}
      cropEnabled={cropEnabled}
      isDraggingImage={isDraggingImage}
      imageBounds={imageBounds}
      selectionHandlePx={selectionHandlePx}
      selectionColor={selectionColor}
      selectionDash={selectionDash}
      snapWorldToDeviceHalfPixel={snapWorldToDeviceHalfPixel}
      selectRects={selectRects}
      beginSelectResize={beginSelectResize}
      cropRect={cropRect}
      cropRects={cropRects}
      cropBusy={cropBusy}
      applyCropMove={applyCropMove}
      onCropDblClick={onCropDblClick}
      beginCropResize={beginCropResize}
      borderColor={borderColor}
      borderWidth={borderWidth}
    />
  )
})

