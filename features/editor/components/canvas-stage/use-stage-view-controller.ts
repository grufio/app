"use client"

import { useCallback, useEffect, useMemo, useState, type RefObject } from "react"
import type Konva from "konva"

import { fitToWorld, zoomAround } from "@/lib/editor/canvas-model"
import { useWheelZoomGuard } from "./stage-lifecycle-controller"
import type { ViewState } from "./types"

export function useStageViewController(args: {
  containerRef: RefObject<HTMLDivElement | null>
  stageRef: RefObject<Konva.Stage | null>
  world: { w: number; h: number } | null
  fitPadding: number
  hasArtboard: boolean
  userInteractedRef: RefObject<boolean>
  autoFitKeyRef: RefObject<string | null>
  panDeltaRef: RefObject<{ dx: number; dy: number }>
  zoomRef: RefObject<{ factor: number; x: number; y: number } | null>
  schedulePanRaf: () => void
  scheduleZoomRaf: () => void
}) {
  const { containerRef, stageRef, world, fitPadding, hasArtboard, userInteractedRef, autoFitKeyRef, panDeltaRef, zoomRef, schedulePanRaf, scheduleZoomRaf } = args
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState<ViewState>({ scale: 1, x: 0, y: 0 })

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
  }, [containerRef])

  const stagePixelRatio = useMemo(() => {
    if (typeof window === "undefined") return 1
    const dpr = Number(window.devicePixelRatio || 1)
    if (!Number.isFinite(dpr)) return 1
    return Math.min(2, Math.max(1, dpr))
  }, [])

  const fitToView = useCallback(() => {
    if (!world) return
    if (size.w <= 0 || size.h <= 0) return
    userInteractedRef.current = false
    autoFitKeyRef.current = null
    setView(fitToWorld(size, world, fitPadding))
  }, [autoFitKeyRef, fitPadding, size, userInteractedRef, world])

  const zoomIn = useCallback(() => {
    const pointer = { x: size.w / 2, y: size.h / 2 }
    userInteractedRef.current = true
    setView((v) => zoomAround(v, pointer, 1.1, 0.05, 8))
  }, [size.h, size.w, userInteractedRef])

  const zoomOut = useCallback(() => {
    const pointer = { x: size.w / 2, y: size.h / 2 }
    userInteractedRef.current = true
    setView((v) => zoomAround(v, pointer, 1 / 1.1, 0.05, 8))
  }, [size.h, size.w, userInteractedRef])

  useEffect(() => {
    if (!hasArtboard) return
    if (!world) return
    if (size.w <= 0 || size.h <= 0) return
    if (userInteractedRef.current) return

    const key = `${size.w}x${size.h}:${world.w}x${world.h}:p${fitPadding}`
    if (autoFitKeyRef.current === key) return
    autoFitKeyRef.current = key
    const nextView = fitToWorld(size, world, fitPadding)
    const raf = window.requestAnimationFrame(() => {
      setView((prev) => {
        if (prev.scale === nextView.scale && prev.x === nextView.x && prev.y === nextView.y) return prev
        return nextView
      })
    })
    return () => window.cancelAnimationFrame(raf)
  }, [autoFitKeyRef, fitPadding, hasArtboard, size, userInteractedRef, world])

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
    [stageRef]
  )

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
        scheduleZoomRaf()
        return
      }

      userInteractedRef.current = true
      panDeltaRef.current.dx += e.evt.deltaX
      panDeltaRef.current.dy += e.evt.deltaY
      schedulePanRaf()
    },
    [panDeltaRef, schedulePanRaf, scheduleZoomRaf, stageRef, userInteractedRef, zoomRef]
  )

  return {
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
  }
}
