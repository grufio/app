/**
 * Web Worker that runs the linerate preview's L0 flatten off the main thread.
 * L0 is the one heavy stage (several 2D FFTs per β iteration); at ~256px it is
 * ~1–2s, which would freeze the tab if run synchronously in a `useMemo`
 * (`useDeferredValue` only defers React rendering, not a long JS call). L0
 * depends only on `flatten`, so this runs rarely; the fast CC + merge stays on
 * the main thread. Coverage selection + segmentation are cheap and stay there.
 */
/// <reference lib="webworker" />
import { l0Smooth } from "./l0-smooth"

type Request = { id: number; rgba: Uint8ClampedArray; width: number; height: number; flatten: number }

self.addEventListener("message", (e: MessageEvent<Request>) => {
  const { id, rgba, width, height, flatten } = e.data
  const out = l0Smooth({ width, height, rgba: new Uint8ClampedArray(rgba) }, flatten)
  ;(self as DedicatedWorkerGlobalScope).postMessage(
    { id, rgba: out.rgba, width: out.width, height: out.height },
    [out.rgba.buffer],
  )
})

export {}
