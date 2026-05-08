"use client"

/**
 * Image position inputs (X / Y in user-facing units).
 *
 * Each axis is a <FormField variant="numeric"> with its own onCommit.
 * Per-axis commits send only the changed axis to the canvas: the unchanged
 * axis is preserved end-to-end (canvas state, network payload, DB row), so
 * a Y-edit no longer sends an X column update at all.
 */
import { useMemo } from "react"

import { FormField } from "@/components/ui/form-controls"
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
  onCommitPosition: (opts: { xPxU?: bigint; yPxU?: bigint }) => void
}) {
  const computedX = useMemo(() => {
    if (!ready || xPxU == null) return ""
    return pxUToUnitDisplayUiFixed(xPxU, unit)
  }, [ready, unit, xPxU])

  const computedY = useMemo(() => {
    if (!ready || yPxU == null) return ""
    return pxUToUnitDisplayUiFixed(yPxU, unit)
  }, [ready, unit, yPxU])

  const onCommitX = (next: string) => {
    const parsedX = parseSignedMicroPxFromUnitInput(next, unit)
    if (parsedX == null) return
    if (parsedX === xPxU) return
    onCommitPosition({ xPxU: parsedX })
  }

  const onCommitY = (next: string) => {
    const parsedY = parseSignedMicroPxFromUnitInput(next, unit)
    if (parsedY == null) return
    if (parsedY === yPxU) return
    onCommitPosition({ yPxU: parsedY })
  }

  return (
    <PanelTwoFieldRow>
      <FormField
        variant="numeric"
        numericMode="signedDecimal"
        label={`Image x position (${unit})`}
        labelVisuallyHidden
        iconStart={<PositionAxisBadge label="x" />}
        unit={unit}
        value={computedX}
        onCommit={onCommitX}
        disabled={controlsDisabled}
      />

      <FormField
        variant="numeric"
        numericMode="signedDecimal"
        label={`Image y position (${unit})`}
        labelVisuallyHidden
        iconStart={<PositionAxisBadge label="y" />}
        unit={unit}
        value={computedY}
        onCommit={onCommitY}
        disabled={controlsDisabled}
      />

      <PanelIconSlot />
    </PanelTwoFieldRow>
  )
}
