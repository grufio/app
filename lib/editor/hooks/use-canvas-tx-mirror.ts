"use client"

/**
 * Canvas transform mirror.
 *
 * The Konva canvas owns the actual rendered image transform (drag,
 * resize, nudge, crop). React-side consumers — the right panel's px
 * readout, the arrow-key nudge handler — need to read that value
 * reactively, but the canvas is a Konva imperative tree and not React
 * state. This hook bridges the gap with a single piece of mirror
 * state plus the bound handlers that feed it.
 *
 * What lives here:
 *   - `imageTxU` — the mirrored canvas tx in µpx. Consumed by
 *     `useRightPanelModel` for the panel's px readout.
 *   - `initialImageTxU` — the SSR-seeded transform converted into the
 *     same `(x, y, w, h)` shape, gated on a non-null
 *     `activeCanvasImageId` and on positive width/height. Falls back
 *     in the right panel before the canvas reports its first tx.
 *   - `handleImageTransformChange(tx)` — feed to
 *     `ProjectCanvasStage.onImageTransformChange`. Stores tx with a
 *     value-equality short-circuit so identical reports don't churn
 *     consumers.
 *   - `handleNudge(dxPx, dyPx)` — arrow-key handler for
 *     `useEditorKeyboard.onNudge`. Reads the current mirror and
 *     dispatches `setImagePosition` through the canvas ref. No-ops
 *     when the mirror is null (canvas has no image yet).
 *   - `clear()` — force the mirror to null. Called when the master
 *     image is deleted so the right panel doesn't briefly show a
 *     stale transform before the canvas's null-callback fires.
 *
 * Pre-Tier-C the shell owned all five inline as `useState` /
 * `useMemo` / `useCallback`s. Every input is already a hook
 * parameter — the shell was just plumbing.
 */
import { useCallback, useMemo, useState, type RefObject } from "react"

import type { ProjectCanvasStageHandle } from "@/features/editor"

export type ImageTxU = { x: bigint; y: bigint; w: bigint; h: bigint }

type InitialImageTransform = {
  xPxU?: bigint
  yPxU?: bigint
  widthPxU?: bigint
  heightPxU?: bigint
} | null

/**
 * Pure helper: convert the SSR-seeded transform into the px-µ tuple
 * shape, applying the validity gate (positive width + height, present
 * `activeCanvasImageId`). Exported so callers can derive the same
 * value without touching the React-bound hook.
 */
export function deriveInitialImageTxU(args: {
  activeCanvasImageId: string | null
  initialImageTransform: InitialImageTransform
}): ImageTxU | null {
  const { activeCanvasImageId, initialImageTransform } = args
  if (!activeCanvasImageId || !initialImageTransform) return null
  const wU = initialImageTransform.widthPxU
  const hU = initialImageTransform.heightPxU
  if (!wU || !hU || wU <= 0n || hU <= 0n) return null
  return {
    x: initialImageTransform.xPxU ?? 0n,
    y: initialImageTransform.yPxU ?? 0n,
    w: wU,
    h: hU,
  }
}

export function useCanvasTxMirror(args: {
  canvasRef: RefObject<ProjectCanvasStageHandle | null>
  activeCanvasImageId: string | null
  initialImageTransform: InitialImageTransform
}) {
  const { canvasRef, activeCanvasImageId, initialImageTransform } = args
  const [imageTxU, setImageTxU] = useState<ImageTxU | null>(null)

  const initialImageTxU = useMemo<ImageTxU | null>(
    () => deriveInitialImageTxU({ activeCanvasImageId, initialImageTransform }),
    [activeCanvasImageId, initialImageTransform]
  )

  const handleImageTransformChange = useCallback(
    (tx: { xPxU: bigint; yPxU: bigint; widthPxU: bigint; heightPxU: bigint } | null) => {
      setImageTxU((prev) => {
        if (!tx) return null
        const next: ImageTxU = { x: tx.xPxU, y: tx.yPxU, w: tx.widthPxU, h: tx.heightPxU }
        if (prev && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h) return prev
        return next
      })
    },
    []
  )

  const handleNudge = useCallback(
    (dxPx: number, dyPx: number) => {
      if (!imageTxU) return
      const dxPxU = BigInt(Math.round(dxPx)) * 1_000_000n
      const dyPxU = BigInt(Math.round(dyPx)) * 1_000_000n
      canvasRef.current?.setImagePosition({
        xPxU: imageTxU.x + dxPxU,
        yPxU: imageTxU.y + dyPxU,
      })
    },
    [canvasRef, imageTxU]
  )

  const clear = useCallback(() => setImageTxU(null), [])

  return {
    imageTxU,
    initialImageTxU,
    handleImageTransformChange,
    handleNudge,
    clear,
  }
}
