"use client"

import type { MutableRefObject } from "react"
import { Group, Image as KonvaImage, Layer, Line, Rect, Stage } from "react-konva"
import type Konva from "konva"

import type { ResizeHandle } from "./select-controller"
import { SelectionOverlay } from "./selection-overlay"
import type { BoundsRect, ViewState } from "./types"

export function CanvasStageScene(props: {
  containerRef: MutableRefObject<HTMLDivElement | null>
  stageRef: MutableRefObject<Konva.Stage | null>
  layerRef: MutableRefObject<Konva.Layer | null>
  imageNodeRef: MutableRefObject<Konva.Image | null>
  className?: string
  alt?: string
  size: { w: number; h: number }
  stagePixelRatio: number
  view: ViewState
  panEnabled: boolean
  onStageDragStart: (e: Konva.KonvaEventObject<DragEvent>) => void
  onStageDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void
  onWheel: (e: Konva.KonvaEventObject<WheelEvent>) => void
  drawArtboard: boolean
  artW: number
  artH: number
  shouldClipToArtboard: boolean
  img: HTMLImageElement | null
  imageTx: { xPxU: bigint; yPxU: bigint; widthPxU: bigint; heightPxU: bigint } | null
  imageRender: { width: number; height: number; x: number; y: number } | null
  imageDraggable: boolean
  rotation: number
  onImageDragInteraction: () => void
  markUserChanged: () => void
  dragPosRef: MutableRefObject<{ x: number; y: number } | null>
  setIsDraggingImage: (next: boolean) => void
  scheduleBoundsUpdate: () => void
  updateBoundsDuringDragMove: () => void
  scheduleCommitTransform: (commitPosition: boolean, delayMs?: number) => void
  snappedGridLines: { lines: Array<{ key: string; points: number[] }>; stroke: string; strokeWidth: number } | null
  renderArtboard: boolean
  cropEnabled: boolean
  isDraggingImage: boolean
  imageBounds: BoundsRect | null
  selectionHandlePx: number
  selectionColor: string
  selectionDash: number[] | undefined
  snapWorldToDeviceHalfPixel: (worldCoord: number, axis: "x" | "y") => number
  selectRects: {
    handles: Record<ResizeHandle, { x: number; y: number }>
    handleSize: { w: number; h: number }
  } | null
  beginSelectResize: (handle: ResizeHandle, keepAspect: boolean) => void
  cropRect: { x: number; y: number; w: number; h: number } | null
  cropRects: {
    handles: Record<ResizeHandle, { x: number; y: number }>
    handleSize: { w: number; h: number }
  } | null
  cropBusy: boolean
  applyCropMove: (nextX: number, nextY: number) => void
  onCropDblClick?: () => void
  beginCropResize: (handle: ResizeHandle, keepAspect: boolean) => void
  borderColor: string
  borderWidth: number
}) {
  const {
    containerRef,
    stageRef,
    layerRef,
    imageNodeRef,
    className,
    alt,
    size,
    stagePixelRatio,
    view,
    panEnabled,
    onStageDragStart,
    onStageDragEnd,
    onWheel,
    drawArtboard,
    artW,
    artH,
    shouldClipToArtboard,
    img,
    imageTx,
    imageRender,
    imageDraggable,
    rotation,
    onImageDragInteraction,
    markUserChanged,
    dragPosRef,
    setIsDraggingImage,
    scheduleBoundsUpdate,
    updateBoundsDuringDragMove,
    scheduleCommitTransform,
    snappedGridLines,
    renderArtboard,
    cropEnabled,
    isDraggingImage,
    imageBounds,
    selectionHandlePx,
    selectionColor,
    selectionDash,
    snapWorldToDeviceHalfPixel,
    selectRects,
    beginSelectResize,
    cropRect,
    cropRects,
    cropBusy,
    applyCropMove,
    onCropDblClick,
    beginCropResize,
    borderColor,
    borderWidth,
  } = props

  return (
    <div
      ref={(n) => {
        containerRef.current = n
      }}
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
        pixelRatio={stagePixelRatio}
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
                  onImageDragInteraction()
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

            {snappedGridLines && snappedGridLines.lines.length
              ? snappedGridLines.lines.map((l) => (
                  <Line key={l.key} points={l.points} stroke={snappedGridLines.stroke} strokeWidth={snappedGridLines.strokeWidth} strokeScaleEnabled={false} listening={false} />
                ))
              : null}

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

            {renderArtboard && cropEnabled && cropRect && cropRects ? (
              <>
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

          {drawArtboard
            ? (() => {
                const xL = snapWorldToDeviceHalfPixel(0, "x")
                const xR = snapWorldToDeviceHalfPixel(artW, "x")
                const yT = snapWorldToDeviceHalfPixel(0, "y")
                const yB = snapWorldToDeviceHalfPixel(artH, "y")
                return (
                  <>
                    <Line points={[xL, 0, xL, artH]} stroke={borderColor} strokeWidth={borderWidth} strokeScaleEnabled={false} listening={false} />
                    <Line points={[xR, 0, xR, artH]} stroke={borderColor} strokeWidth={borderWidth} strokeScaleEnabled={false} listening={false} />
                    <Line points={[0, yT, artW, yT]} stroke={borderColor} strokeWidth={borderWidth} strokeScaleEnabled={false} listening={false} />
                    <Line points={[0, yB, artW, yB]} stroke={borderColor} strokeWidth={borderWidth} strokeScaleEnabled={false} listening={false} />
                  </>
                )
              })()
            : null}
        </Layer>
      </Stage>
    </div>
  )
}
