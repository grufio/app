"use client"

import { useMemo, useRef, useState } from "react"

import { PanelSizeField } from "../fields/panel-size-field"
import { PanelIconSlot, PanelTwoFieldRow } from "../panel-layout"
import { pxUToUnitDisplayUiFixed, type Unit } from "@/lib/editor/units"
import { parseSignedMicroPxFromUnitInput } from "@/services/editor/image-sizing"

function PositionAxisBadge({ label }: { label: "x" | "y" }) {
  return <span className="text-xs font-medium leading-none">{label}</span>
}

export function ImagePositionInputs({
  xPxU,
  yPxU,
  unit,
  ready,
  controlsDisabled,
  onCommitPosition,
}: {
  xPxU?: bigint
  yPxU?: bigint
  unit: Unit
  ready: boolean
  controlsDisabled: boolean
  onCommitPosition: (xPxU: bigint, yPxU: bigint) => void
}) {
  const [dirty, setDirty] = useState(false)
  const draftXRef = useRef("")
  const draftYRef = useRef("")
  const [draftX, setDraftX] = useState("")
  const [draftY, setDraftY] = useState("")

  const computedX = useMemo(() => {
    if (!ready || xPxU == null) return ""
    return pxUToUnitDisplayUiFixed(xPxU, unit)
  }, [ready, unit, xPxU])

  const computedY = useMemo(() => {
    if (!ready || yPxU == null) return ""
    return pxUToUnitDisplayUiFixed(yPxU, unit)
  }, [ready, unit, yPxU])

  const beginEditSession = () => {
    if (!ready) return
    if (dirty) return
    draftXRef.current = computedX
    draftYRef.current = computedY
    setDraftX(computedX)
    setDraftY(computedY)
  }

  const resetDraft = () => {
    draftXRef.current = computedX
    draftYRef.current = computedY
    setDraftX(computedX)
    setDraftY(computedY)
  }

  const commit = () => {
    if (!dirty) return
    const nextX = parseSignedMicroPxFromUnitInput(draftXRef.current, unit)
    const nextY = parseSignedMicroPxFromUnitInput(draftYRef.current, unit)
    if (nextX == null || nextY == null) return
    if (xPxU != null && yPxU != null && nextX === xPxU && nextY === yPxU) return
    onCommitPosition(nextX, nextY)
  }

  return (
    <PanelTwoFieldRow>
      <PanelSizeField
        value={dirty ? draftX : computedX}
        disabled={controlsDisabled}
        ariaLabel={`Image x position (${unit})`}
        icon={<PositionAxisBadge label="x" />}
        unit={unit}
        mode="signedDecimal"
        onValueChange={(next) => {
          beginEditSession()
          setDirty(true)
          draftXRef.current = next
          setDraftX(next)
        }}
        onFocus={beginEditSession}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit()
            setDirty(false)
          }
          if (e.key === "Escape") {
            setDirty(false)
            resetDraft()
          }
        }}
        onBlur={() => {
          commit()
          setDirty(false)
        }}
      />

      <PanelSizeField
        value={dirty ? draftY : computedY}
        disabled={controlsDisabled}
        ariaLabel={`Image y position (${unit})`}
        icon={<PositionAxisBadge label="y" />}
        unit={unit}
        mode="signedDecimal"
        onValueChange={(next) => {
          beginEditSession()
          setDirty(true)
          draftYRef.current = next
          setDraftY(next)
        }}
        onFocus={beginEditSession}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit()
            setDirty(false)
          }
          if (e.key === "Escape") {
            setDirty(false)
            resetDraft()
          }
        }}
        onBlur={() => {
          commit()
          setDirty(false)
        }}
      />

      <PanelIconSlot />
    </PanelTwoFieldRow>
  )
}
