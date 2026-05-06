"use client"

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
} from "lucide-react"
import { useState } from "react"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { PanelIconSlot, PanelTwoFieldRow } from "../panel-layout"

export function ImageAlignmentControls({
  controlsDisabled,
  onAlign,
}: {
  controlsDisabled: boolean
  onAlign: (opts: { x?: "left" | "center" | "right"; y?: "top" | "center" | "bottom" }) => void
}) {
  // Functional button bars (no selected visual state). We keep transient value just to satisfy Radix.
  const [alignXAction, setAlignXAction] = useState<string>("")
  const [alignYAction, setAlignYAction] = useState<string>("")

  return (
    <PanelTwoFieldRow>
      <div className="flex items-center">
        <ToggleGroup
          type="single"
          value={alignXAction}
          onValueChange={(v) => {
            if (!v) return
            onAlign({ x: v as "left" | "center" | "right" })
            setAlignXAction("")
          }}
          className="w-full justify-start"
        >
          <ToggleGroupItem value="left" size="sm" className="flex-1" aria-label="Align left" disabled={controlsDisabled}>
            <AlignLeft className="size-4" strokeWidth={1} />
          </ToggleGroupItem>
          <ToggleGroupItem value="center" size="sm" className="flex-1" aria-label="Align center" disabled={controlsDisabled}>
            <AlignCenter className="size-4" strokeWidth={1} />
          </ToggleGroupItem>
          <ToggleGroupItem value="right" size="sm" className="flex-1" aria-label="Align right" disabled={controlsDisabled}>
            <AlignRight className="size-4" strokeWidth={1} />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="flex items-center">
        <ToggleGroup
          type="single"
          value={alignYAction}
          onValueChange={(v) => {
            if (!v) return
            onAlign({ y: v as "top" | "center" | "bottom" })
            setAlignYAction("")
          }}
          className="w-full justify-start"
        >
          <ToggleGroupItem value="top" size="sm" className="flex-1" aria-label="Align top" disabled={controlsDisabled}>
            <AlignVerticalJustifyStart className="size-4" strokeWidth={1} />
          </ToggleGroupItem>
          <ToggleGroupItem value="center" size="sm" className="flex-1" aria-label="Align middle" disabled={controlsDisabled}>
            <AlignVerticalJustifyCenter className="size-4" strokeWidth={1} />
          </ToggleGroupItem>
          <ToggleGroupItem value="bottom" size="sm" className="flex-1" aria-label="Align bottom" disabled={controlsDisabled}>
            <AlignVerticalJustifyEnd className="size-4" strokeWidth={1} />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* icon-slot placeholder */}
      <PanelIconSlot />
    </PanelTwoFieldRow>
  )
}
