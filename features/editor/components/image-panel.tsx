"use client"

/**
 * Image transform panel.
 *
 * Responsibilities:
 * - Edit the working image size and alignment in the editor.
 * - Dispatch commits to the canvas stage imperative API.
 *
 * The panel is split into three sub-components for testability and so each
 * one stays focused on a single concern:
 * - ImageSizeInputs       (width/height + lock-aspect)
 * - ImagePositionInputs   (x/y in artboard units)
 * - ImageAlignmentControls (left/center/right + top/center/bottom)
 */
import type { Unit } from "@/lib/editor/units"

import { ImageAlignmentControls } from "./image-panel/image-alignment-controls"
import { ImagePositionInputs } from "./image-panel/image-position-inputs"
import { ImageSizeInputs } from "./image-panel/image-size-inputs"

type Props = {
  widthPxU?: bigint
  heightPxU?: bigint
  xPxU?: bigint
  yPxU?: bigint
  unit: Unit
  /**
   * When false, inputs stay empty and commits are ignored.
   * Use this to prevent "flash" / drift while upstream meta/state is still loading.
   */
  ready?: boolean
  disabled?: boolean
  onCommit: (widthPxU: bigint, heightPxU: bigint) => void
  onCommitPosition: (xPxU: bigint, yPxU: bigint) => void
  onAlign: (opts: { x?: "left" | "center" | "right"; y?: "top" | "center" | "bottom" }) => void
}

/**
 * Image sizing panel.
 *
 * The UI displays image size in the artboard's unit,
 * but commits changes in pixels to the canvas (so scaling remains stable).
 */
export function ImagePanel({ widthPxU, heightPxU, xPxU, yPxU, unit, ready = true, disabled, onCommit, onCommitPosition, onAlign }: Props) {
  const controlsDisabled = Boolean(disabled) || !ready

  return (
    <div className="space-y-4">
      <ImageSizeInputs
        widthPxU={widthPxU}
        heightPxU={heightPxU}
        unit={unit}
        ready={ready}
        controlsDisabled={controlsDisabled}
        onCommit={onCommit}
      />

      <ImagePositionInputs
        xPxU={xPxU}
        yPxU={yPxU}
        unit={unit}
        ready={ready}
        controlsDisabled={controlsDisabled}
        onCommitPosition={onCommitPosition}
      />

      <ImageAlignmentControls controlsDisabled={controlsDisabled} onAlign={onAlign} />
    </div>
  )
}
