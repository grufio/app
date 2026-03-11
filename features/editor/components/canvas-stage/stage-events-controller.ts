"use client"

import { useCallback, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from "react"
import type Konva from "konva"

import { RAF_PAN, RAF_ZOOM } from "./raf-scheduler"
import type { ViewState } from "./types"

export function useStageEventsController(args: {
  stageRef: RefObject<Konva.Stage | null>
  userInteractedRef: MutableRefObject<boolean>
  panDeltaRef: MutableRefObject<{ dx: number; dy: number }>
  zoomRef: MutableRefObject<{ factor: number; x: number; y: number } | null>
  scheduleRaf: (flag: number) => void
  setView: Dispatch<SetStateAction<ViewState>>
}) {
  const { stageRef, userInteractedRef, panDeltaRef, zoomRef, scheduleRaf, setView } = args

  const onWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault()
      const stage = stageRef.current
      if (!stage) return

      if (e.evt.ctrlKey || e.evt.metaKey) {
        userInteractedRef.current = true
        const pos = stage.getPointerPosition()
        if (!pos) return
        const factor = Math.pow(1.0015, -e.evt.deltaY)
        const prev = zoomRef.current
        zoomRef.current = prev ? { factor: prev.factor * factor, x: pos.x, y: pos.y } : { factor, x: pos.x, y: pos.y }
        scheduleRaf(RAF_ZOOM)
        return
      }

      userInteractedRef.current = true
      panDeltaRef.current.dx += e.evt.deltaX
      panDeltaRef.current.dy += e.evt.deltaY
      scheduleRaf(RAF_PAN)
    },
    [panDeltaRef, scheduleRaf, stageRef, userInteractedRef, zoomRef]
  )

  const onStageDragStart = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      if (e.target === stageRef.current) userInteractedRef.current = true
    },
    [stageRef, userInteractedRef]
  )

  const onStageDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      const stage = stageRef.current
      if (!stage) return
      if (e.target !== stage) return
      setView((v) => {
        const x = stage.x()
        const y = stage.y()
        if (v.x === x && v.y === y) return v
        return { ...v, x, y }
      })
    },
    [setView, stageRef]
  )

  return { onWheel, onStageDragStart, onStageDragEnd }
}
