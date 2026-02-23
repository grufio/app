"use client"

import { useEffect, type RefObject } from "react"

type ResizeListenerLifecycleArgs = {
  cropBusy: boolean
  cropEnabled: boolean
  imageDraggable: boolean
  panEnabled: boolean
  stopSelectResize: () => void
  stopCropResize: () => void
}

export function useResizeListenerLifecycle(args: ResizeListenerLifecycleArgs) {
  const { cropBusy, cropEnabled, imageDraggable, panEnabled, stopCropResize, stopSelectResize } = args
  useEffect(() => {
    // Any mode switch (select <-> crop <-> hand) must hard-stop active resize listeners.
    stopSelectResize()
    stopCropResize()
  }, [cropBusy, cropEnabled, imageDraggable, panEnabled, stopCropResize, stopSelectResize])
}

export function useWheelZoomGuard(containerRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (evt: WheelEvent) => {
      if (evt.ctrlKey || evt.metaKey) evt.preventDefault()
    }
    el.addEventListener("wheel", handler, { passive: false })
    return () => el.removeEventListener("wheel", handler)
  }, [containerRef])
}
