"use client"

import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from "react"

import { panBy, zoomAround } from "@/lib/editor/canvas-model"

import { createRafScheduler, RAF_BOUNDS, RAF_DRAG_BOUNDS } from "./raf-scheduler"
import type { ViewState } from "./types"

function bumpRafMetric(key: "rafScheduled" | "rafExecuted") {
  const g = globalThis as unknown as { __gruf_editor?: { rafScheduled?: number; rafExecuted?: number } }
  const state = g.__gruf_editor
  if (!state) return
  state[key] = (state[key] ?? 0) + 1
}

export function useStageRafBoundsController(args: {
  boundsControllerRef: MutableRefObject<{
    updateImageBoundsFromNode: () => void
    flushDragBounds: () => void
    accumulateDragDelta: (dx: number, dy: number) => void
  } | null>
  imageNodeRef: RefObject<{ x: () => number; y: () => number } | null>
  rotationRef: MutableRefObject<number>
  dragPosRef: MutableRefObject<{ x: number; y: number } | null>
  panDeltaRef: MutableRefObject<{ dx: number; dy: number }>
  zoomRef: MutableRefObject<{ factor: number; x: number; y: number } | null>
  setView: Dispatch<SetStateAction<ViewState>>
}) {
  const { boundsControllerRef, imageNodeRef, rotationRef, dragPosRef, panDeltaRef, zoomRef, setView } = args

  const updateImageBoundsFromNode = useCallback(() => {
    boundsControllerRef.current?.updateImageBoundsFromNode()
  }, [boundsControllerRef])

  const rafSchedulerRef = useRef<ReturnType<typeof createRafScheduler> | null>(null)

  useEffect(() => {
    const scheduler = createRafScheduler({
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
        bumpRafMetric("rafScheduled")
      },
      onRafExecuted: () => {
        bumpRafMetric("rafExecuted")
      },
    })

    rafSchedulerRef.current = scheduler
    return () => {
      scheduler.dispose()
      if (rafSchedulerRef.current === scheduler) {
        rafSchedulerRef.current = null
      }
    }
  }, [boundsControllerRef, panDeltaRef, setView, updateImageBoundsFromNode, zoomRef])

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
  }, [boundsControllerRef, dragPosRef, imageNodeRef, rotationRef, scheduleBoundsUpdate, scheduleRaf])

  const disposeRafScheduler = useCallback(() => {
    rafSchedulerRef.current?.dispose()
    rafSchedulerRef.current = null
  }, [])

  return { scheduleRaf, scheduleBoundsUpdate, updateBoundsDuringDragMove, disposeRafScheduler }
}
