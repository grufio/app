"use client"

/**
 * Konva canvas stage for the project editor.
 *
 * Responsibilities:
 * - Render the artboard, grid, selection overlay, and image node.
 * - Delegate RAF/bounds/transform persistence to controller modules.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import { Group, Image as KonvaImage, Layer, Rect, Stage } from "react-konva"
import type Konva from "konva"

import { pxUToPxNumber } from "@/lib/editor/units"
import { useAlignImageController, type AlignImageOptions } from "./canvas-stage/align-controller"
import { createBoundsController } from "./canvas-stage/bounds-controller"
import { computeGridLines, snapGridLinesToDevicePixels } from "./canvas-stage/grid-lines"
import { useInitialImagePlacement } from "./canvas-stage/initial-placement-controller"
import { useRestoreBaseSpecController } from "./canvas-stage/restore-base-spec-controller"
import { useViewController } from "./canvas-stage/view-controller"
import { useStageRafBoundsController } from "./canvas-stage/stage-raf-bounds-controller"
import { useSelectionCropController } from "./canvas-stage/selection-crop-controller"
import { useStageEventsController } from "./canvas-stage/stage-events-controller"
import { pickIntrinsicSize } from "./canvas-stage/placement"
import { createStateSyncGuard } from "./canvas-stage/state-sync-guard"
import { snapWorldToDeviceHalfPixel as snapHalfPixel } from "./canvas-stage/pixel-snap"
import { useRestoreImageController, type RestoreBaseSpec, type RestoreImageResult } from "./canvas-stage/restore-controller"
import type { CropRectWorld } from "./canvas-stage/crop-controller"
import type { ResizeHandle } from "./canvas-stage/select-controller"
import { ArtboardBorder } from "./canvas-stage/artboard-border"
import { GridOverlay } from "./canvas-stage/grid-overlay"
import { SelectionOverlay } from "./canvas-stage/selection-overlay"
import { useWheelZoomGuard } from "./canvas-stage/stage-lifecycle-controller"
import { createTransformController } from "./canvas-stage/transform-controller"
import type { BoundsRect, ViewState } from "./canvas-stage/types"
import { useHtmlImage } from "./canvas-stage/use-html-image"
import { computeWorldSize } from "@/services/editor"

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
  artboardDpi?: number
  /**
   * Intrinsic (source) image pixel dimensions from persisted metadata (DB).
   * This must be the canonical source of truth for initial sizing (not DOM layout).
   */
  intrinsicWidthPx?: number
  intrinsicHeightPx?: number
  imageDpi?: number | null
  /** Canonical restore baseline from initial upload master image. */
  restoreBaseImageId?: string | null
  restoreBaseWidthPx?: number
  restoreBaseHeightPx?: number
  restoreBaseDpi?: number | null
  grid?: {
    spacingXPx: number
    spacingYPx: number
    lineWidthPx: number
    color: string
  } | null
  onImageTransformChange?: (tx: { xPxU: bigint; yPxU: bigint; widthPxU: bigint; heightPxU: bigint } | null) => void
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
  setImagePosition: (xPxU: bigint, yPxU: bigint) => void
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
    artboardDpi,
    intrinsicWidthPx,
    intrinsicHeightPx,
    imageDpi,
    restoreBaseImageId,
    restoreBaseWidthPx,
    restoreBaseHeightPx,
    restoreBaseDpi,
    grid = null,
    onImageTransformChange,
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

  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState<ViewState>({ scale: 1, x: 0, y: 0 })
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
  const onImageTransformChangeRef = useRef<Props["onImageTransformChange"]>(onImageTransformChange)
  const dragPosRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    onImageTransformChangeRef.current = onImageTransformChange
  }, [onImageTransformChange])

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

  useEffect(() => {
    // New active image => persisted placement/transform may apply again.
    // Clear "user changed" gating so previous image edits never block the next image.
    stateSyncGuardRef.current.resetForNewImage()
  }, [activeImageId])


  useRestoreBaseSpecController({
    restoreBaseImageId,
    restoreBaseWidthPx,
    restoreBaseHeightPx,
    restoreBaseDpi,
    restoreBaseSpecRef,
  })

  // Prevent browser page zoom / scroll stealing (Cmd/Ctrl + wheel / trackpad pinch).
  useWheelZoomGuard(containerRef)

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
  const shouldClipToArtboard = clipToArtboard && hasArtboard
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


  const snappedGridLines = useMemo(() => {
    return snapGridLinesToDevicePixels({ gridLines, snapWorldToDeviceHalfPixel })
  }, [gridLines, snapWorldToDeviceHalfPixel])

  const { fitToView, zoomIn, zoomOut } = useViewController({
    hasArtboard,
    world,
    size,
    fitPadding,
    setView,
    userInteractedRef,
    autoFitKeyRef,
  })

  const reportImageTransform = useCallback((tx: { xPxU: bigint; yPxU: bigint; widthPxU: bigint; heightPxU: bigint } | null) => {
    onImageTransformChangeRef.current?.(tx)
  }, [])

  // Report transform to the parent *after* state commits.
  // Do NOT call inside state updaters — triggers "Cannot update a component while rendering a different component".
  useEffect(() => {
    reportImageTransform(imageTx)
  }, [imageTx, reportImageTransform])

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

  const { scheduleRaf, scheduleBoundsUpdate, updateBoundsDuringDragMove, disposeRafScheduler } =
    useStageRafBoundsController({
      boundsControllerRef,
      imageNodeRef,
      rotationRef,
      dragPosRef,
      panDeltaRef,
      zoomRef,
      setView,
    })

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


  useInitialImagePlacement({
    src,
    img,
    hasArtboard,
    artW,
    artH,
    artboardDpi,
    imageDpi,
    intrinsicWidthPx,
    intrinsicHeightPx,
    initialImageTransform,
    activeImageId,
    placedKeyRef,
    stateSyncGuardRef,
    setRotation,
    setImageTx,
    scheduleBoundsUpdate,
  })

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
      disposeRafScheduler()
    }
  }, [disposeRafScheduler])

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

  const setImagePosition = useCallback(
    (xPxU: bigint, yPxU: bigint) => {
      if (!mutationsEnabled) return
      transformControllerRef.current?.setImagePosition(xPxU, yPxU)
    },
    [mutationsEnabled]
  )

  const restoreImageRaw = useRestoreImageController({
    artW,
    artH,
    artboardDpi,
    restoreBaseSpecRef,
    activeImageId,
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

  const {
    beginSelectResize,
    cropRect,
    applyCropMove,
    beginCropResize,
    getCropSelection,
    getCropSelectionPx,
    resetCropSelection,
    cropRects,
    selectRects,
  } = useSelectionCropController({
    cropEnabled,
    cropBusy,
    imageDraggable,
    panEnabled,
    view,
    containerRef,
    imageFrame,
    hasArtboard,
    artW,
    artH,
    intrinsicWidthPx,
    intrinsicHeightPx,
    imageRender,
    rotation,
    selectionHandlePx,
    snapWorldToDeviceHalfPixel,
    setImageTx,
    markUserChanged,
    scheduleBoundsUpdate,
    scheduleCommitTransform,
  })

  const { onWheel, onStageDragStart, onStageDragEnd } = useStageEventsController({
    stageRef,
    userInteractedRef,
    panDeltaRef,
    zoomRef,
    scheduleRaf,
    setView,
  })

  useImperativeHandle(
    ref,
    () => ({
      fitToView,
      zoomIn,
      zoomOut,
      rotate90,
      setImageSize,
      setImagePosition,
      alignImage,
      restoreImage,
      getCropSelection,
      getCropSelectionPx,
      resetCropSelection,
    }),
    [alignImage, fitToView, getCropSelection, getCropSelectionPx, resetCropSelection, restoreImage, rotate90, setImagePosition, setImageSize, zoomIn, zoomOut]
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
        onDragStart={onStageDragStart}
        onDragEnd={onStageDragEnd}
        onWheel={onWheel}
      >
        <Layer
          ref={(n) => {
            layerRef.current = n
          }}
        >
          {drawArtboard ? <Rect x={0} y={0} width={artW} height={artH} fill="#ffffff" listening={false} /> : null}

          <Group
            clipX={shouldClipToArtboard ? 0 : undefined}
            clipY={shouldClipToArtboard ? 0 : undefined}
            clipWidth={shouldClipToArtboard ? artW : undefined}
            clipHeight={shouldClipToArtboard ? artH : undefined}
          >
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
                  markUserChanged()
                  const node = imageNodeRef.current
                  dragPosRef.current = node ? { x: node.x(), y: node.y() } : null
                  setIsDraggingImage(true)
                  scheduleBoundsUpdate()
                }}
                onDragMove={() => {
                  updateBoundsDuringDragMove()
                }}
                onDragEnd={() => {
                  markUserChanged()
                  scheduleCommitTransform(true, 0)
                  dragPosRef.current = null
                  setIsDraggingImage(false)
                  scheduleBoundsUpdate()
                }}
              />
            ) : null}

            {/* Grid overlay (under selection frame). */}
            <GridOverlay snappedGridLines={snappedGridLines} />

            {/* Default selection frame (shown when the Select tool is active) */}
            {renderArtboard && imageDraggable && !cropEnabled && !isDraggingImage ? (
              <>
                <SelectionOverlay
                  imageBounds={imageBounds}
                  view={view}
                  selectionHandlePx={selectionHandlePx}
                  selectionColor={selectionColor}
                  selectionDash={selectionDash}
                  snapWorldToDeviceHalfPixel={snapWorldToDeviceHalfPixel}
                />
                {selectRects
                  ? (
                      [
                        { key: "tl", pt: selectRects.handles.tl },
                        { key: "tm", pt: selectRects.handles.tm },
                        { key: "tr", pt: selectRects.handles.tr },
                        { key: "rm", pt: selectRects.handles.rm },
                        { key: "br", pt: selectRects.handles.br },
                        { key: "bm", pt: selectRects.handles.bm },
                        { key: "bl", pt: selectRects.handles.bl },
                        { key: "lm", pt: selectRects.handles.lm },
                      ] as Array<{ key: ResizeHandle; pt: { x: number; y: number } }>
                    ).map((h) => (
                      <Rect
                        key={`select-hit-${h.key}`}
                        x={h.pt.x}
                        y={h.pt.y}
                        width={selectRects.handleSize.w}
                        height={selectRects.handleSize.h}
                        fill="rgba(0,0,0,0)"
                        strokeScaleEnabled={false}
                        listening
                        onMouseDown={(e) => {
                          e.cancelBubble = true
                          e.evt.preventDefault()
                          beginSelectResize(h.key, Boolean(e.evt.shiftKey))
                        }}
                      />
                    ))
                  : null}
              </>
            ) : null}

            {/* Crop overlay (interactive while crop tool is active). */}
            {renderArtboard && cropEnabled && cropRect && cropRects ? (
              <>
                {/* Crop uses its own dashed inner frame within image bounds. */}
                <SelectionOverlay
                  imageBounds={{ x: cropRect.x, y: cropRect.y, w: cropRect.w, h: cropRect.h }}
                  view={view}
                  selectionHandlePx={selectionHandlePx}
                  selectionColor={selectionColor}
                  selectionDash={[4, 4]}
                  snapWorldToDeviceHalfPixel={snapWorldToDeviceHalfPixel}
                />
                <Rect
                  x={cropRect.x}
                  y={cropRect.y}
                  width={cropRect.w}
                  height={cropRect.h}
                  fill="rgba(0,0,0,0)"
                  draggable={!cropBusy}
                  onDragStart={(e) => {
                    e.cancelBubble = true
                  }}
                  onDragMove={(e) => applyCropMove(e.target.x(), e.target.y())}
                  onDblClick={() => onCropDblClick?.()}
                />
                {(
                  [
                    { key: "tl", pt: cropRects.handles.tl },
                    { key: "tm", pt: cropRects.handles.tm },
                    { key: "tr", pt: cropRects.handles.tr },
                    { key: "rm", pt: cropRects.handles.rm },
                    { key: "br", pt: cropRects.handles.br },
                    { key: "bm", pt: cropRects.handles.bm },
                    { key: "bl", pt: cropRects.handles.bl },
                    { key: "lm", pt: cropRects.handles.lm },
                  ] as Array<{ key: ResizeHandle; pt: { x: number; y: number } }>
                ).map((h) => (
                  <Rect
                    key={`crop-hit-${h.key}`}
                    x={h.pt.x}
                    y={h.pt.y}
                    width={cropRects.handleSize.w}
                    height={cropRects.handleSize.h}
                    fill="rgba(0,0,0,0)"
                    strokeScaleEnabled={false}
                    listening={!cropBusy}
                    onMouseDown={(e) => {
                      e.cancelBubble = true
                      e.evt.preventDefault()
                      beginCropResize(h.key, Boolean(e.evt.shiftKey))
                    }}
                  />
                ))}
              </>
            ) : null}
          </Group>

          {drawArtboard ? (
            <ArtboardBorder
              artW={artW}
              artH={artH}
              borderColor={borderColor}
              borderWidth={borderWidth}
              snapWorldToDeviceHalfPixel={snapWorldToDeviceHalfPixel}
            />
          ) : null}
        </Layer>
      </Stage>
    </div>
  )
})

