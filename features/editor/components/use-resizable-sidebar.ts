"use client"

import { useCallback } from "react"

type ResizeArgs = {
  startClientX: number
  startWidthRem: number
  minRem: number
  maxRem: number
  direction: "expand-right" | "expand-left"
  onWidthRemChange: (next: number) => void
}

export function useResizableSidebar() {
  return useCallback((args: ResizeArgs) => {
    const { startClientX, startWidthRem, minRem, maxRem, direction, onWidthRemChange } = args
    const clamp = (v: number) => Math.max(minRem, Math.min(maxRem, v))

    const prevCursor = document.body.style.cursor
    const prevUserSelect = document.body.style.userSelect
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"

    const startWidthPx = startWidthRem * 16
    let rafId: number | null = null
    let lastClientX = startClientX
    const flush = () => {
      rafId = null
      const delta = direction === "expand-right" ? lastClientX - startClientX : startClientX - lastClientX
      const nextWidthPx = startWidthPx + delta
      onWidthRemChange(clamp(nextWidthPx / 16))
    }
    const onMove = (ev: MouseEvent) => {
      lastClientX = ev.clientX
      if (rafId != null) return
      rafId = window.requestAnimationFrame(flush)
    }
    const onUp = () => {
      if (rafId != null) {
        window.cancelAnimationFrame(rafId)
        rafId = null
      }
      flush()
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevUserSelect
    }

    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }, [])
}
