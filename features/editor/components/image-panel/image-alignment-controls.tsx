"use client"

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
} from "lucide-react"

import { PanelIconSlot, PanelTwoFieldRow } from "../panel-layout"
import { RightPanelIconButton } from "../right-panel-controls"

/**
 * Alignment controls (Image-Panel).
 *
 * Six single-shot buttons — three for X-axis (left/center/right), three
 * for Y-axis (top/middle/bottom). Was a Radix ToggleGroup with
 * immediately-cleared state; that was a semantic hack since the buttons
 * never persist a "selected" state, they just dispatch the action and
 * are done. Plain icon buttons match the actual behaviour.
 */
export function ImageAlignmentControls({
  controlsDisabled,
  onAlign,
}: {
  controlsDisabled: boolean
  onAlign: (opts: { x?: "left" | "center" | "right"; y?: "top" | "center" | "bottom" }) => void
}) {
  return (
    <PanelTwoFieldRow>
      <div className="flex w-full [&>button]:flex-1">
        <RightPanelIconButton
          type="button"
          aria-label="Align left"
          disabled={controlsDisabled}
          onClick={() => onAlign({ x: "left" })}
        >
          <AlignLeft className="size-4" />
        </RightPanelIconButton>
        <RightPanelIconButton
          type="button"
          aria-label="Align center"
          disabled={controlsDisabled}
          onClick={() => onAlign({ x: "center" })}
        >
          <AlignCenter className="size-4" />
        </RightPanelIconButton>
        <RightPanelIconButton
          type="button"
          aria-label="Align right"
          disabled={controlsDisabled}
          onClick={() => onAlign({ x: "right" })}
        >
          <AlignRight className="size-4" />
        </RightPanelIconButton>
      </div>

      <div className="flex w-full [&>button]:flex-1">
        <RightPanelIconButton
          type="button"
          aria-label="Align top"
          disabled={controlsDisabled}
          onClick={() => onAlign({ y: "top" })}
        >
          <AlignVerticalJustifyStart className="size-4" />
        </RightPanelIconButton>
        <RightPanelIconButton
          type="button"
          aria-label="Align middle"
          disabled={controlsDisabled}
          onClick={() => onAlign({ y: "center" })}
        >
          <AlignVerticalJustifyCenter className="size-4" />
        </RightPanelIconButton>
        <RightPanelIconButton
          type="button"
          aria-label="Align bottom"
          disabled={controlsDisabled}
          onClick={() => onAlign({ y: "bottom" })}
        >
          <AlignVerticalJustifyEnd className="size-4" />
        </RightPanelIconButton>
      </div>

      <PanelIconSlot />
    </PanelTwoFieldRow>
  )
}
