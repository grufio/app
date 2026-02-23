/**
 * Small helper to attach/remove global mouse listeners.
 *
 * This is used by resize controllers so tool switches can reliably stop
 * active interactions and prevent stale handlers from firing.
 */
export type WindowLike = Pick<Window, "addEventListener" | "removeEventListener">

export function attachWindowMouseDragSession(opts: {
  win: WindowLike
  onMove: (evt: MouseEvent) => void
  onUp: (evt: MouseEvent) => void
}): () => void {
  const { win, onMove, onUp } = opts
  win.addEventListener("mousemove", onMove)
  win.addEventListener("mouseup", onUp)
  return () => {
    win.removeEventListener("mousemove", onMove)
    win.removeEventListener("mouseup", onUp)
  }
}

