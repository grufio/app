"use client"

/**
 * Image transform panel.
 *
 * Responsibilities:
 * - Edit the working image size and alignment in the editor.
 * - Dispatch commits to the canvas stage imperative API.
 */
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowLeftRight,
  ArrowUpDown,
  Link2,
  Unlink2,
} from "lucide-react"
import type { KeyboardEventHandler, ReactNode } from "react"
import { useMemo, useRef, useState } from "react"

import { FieldGroup, FieldGroupAddon, FieldGroupText } from "@/components/ui/form-controls/field-group"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { NumericInput } from "./numeric-input"
import { PanelIconSlot, PanelTwoFieldRow } from "./panel-layout"
import { RightPanelToggleIconButton } from "./right-panel-controls"
import { pxUToUnitDisplayUiFixed, type Unit } from "@/lib/editor/units"
import {
  computeLockedAspectOtherDimensionFromHeightInput,
  computeLockedAspectOtherDimensionFromWidthInput,
  parseSignedMicroPxFromUnitInput,
} from "@/services/editor/image-sizing"
import { computeImageSizeCommit, computeLockedAspectRatioFromCurrentSize } from "@/services/editor/image-sizing-operations"

function SizeField({
  value,
  onValueChange,
  disabled,
  ariaLabel,
  onFocus,
  onKeyDown,
  onBlur,
  addon,
  unit,
  mode = "decimal",
}: {
  value: string
  onValueChange: (next: string) => void
  disabled: boolean
  ariaLabel: string
  onFocus: () => void
  onKeyDown: KeyboardEventHandler<HTMLInputElement>
  onBlur: () => void
  addon: ReactNode
  unit: Unit
  mode?: "decimal" | "signedDecimal"
}) {
  return (
    <FieldGroup>
      <NumericInput
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        aria-label={ariaLabel}
        mode={mode}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
      />
      <FieldGroupAddon align="inline-start" aria-hidden="true">
        {addon}
      </FieldGroupAddon>
      <FieldGroupAddon align="inline-end" className="pointer-events-none" aria-hidden="true">
        <FieldGroupText>{unit}</FieldGroupText>
      </FieldGroupAddon>
    </FieldGroup>
  )
}

function PositionAxisBadge({ label }: { label: "x" | "Y" }) {
  return <span className="text-xs font-medium leading-none">{label}</span>
}

function ImageSizeInputs({
  widthPxU,
  heightPxU,
  unit,
  ready,
  controlsDisabled,
  onCommit,
}: {
  widthPxU?: bigint
  heightPxU?: bigint
  unit: Unit
  ready: boolean
  controlsDisabled: boolean
  onCommit: (widthPxU: bigint, heightPxU: bigint) => void
}) {
  const [dirty, setDirty] = useState(false)
  const ignoreNextBlurCommitRef = useRef(false)
  const lockRatioRef = useRef<{ w: bigint; h: bigint } | null>(null)
  const draftWRef = useRef("")
  const draftHRef = useRef("")
  const [draftW, setDraftW] = useState("")
  const [draftH, setDraftH] = useState("")
  const [lockAspect, setLockAspect] = useState(false)

  const computedW = useMemo(() => {
    if (!ready) return ""
    if (!widthPxU) return ""
    return pxUToUnitDisplayUiFixed(widthPxU, unit)
  }, [ready, unit, widthPxU])

  const computedH = useMemo(() => {
    if (!ready) return ""
    if (!heightPxU) return ""
    return pxUToUnitDisplayUiFixed(heightPxU, unit)
  }, [heightPxU, ready, unit])

  const beginEditSession = () => {
    if (!ready) return
    if (dirty) return
    draftWRef.current = computedW
    draftHRef.current = computedH
    setDraftW(computedW)
    setDraftH(computedH)
  }

  const commit = () => {
    if (!dirty) return
    // Use refs so blur/tab commits always see the latest typed value
    // (React state can be one render behind when events batch).
    // Invariants: docs/specs/sizing-invariants.mdx (round once at input conversion).
    const parsed = computeImageSizeCommit({ ready, draftW: draftWRef.current, draftH: draftHRef.current, unit })
    if (!parsed) return
    if (widthPxU && heightPxU && parsed.wPxU === widthPxU && parsed.hPxU === heightPxU) return
    onCommit(parsed.wPxU, parsed.hPxU)
  }

  return (
    <PanelTwoFieldRow>
      <SizeField
        value={dirty ? draftW : computedW}
        disabled={controlsDisabled}
        ariaLabel={`Image width (${unit})`}
        addon={<ArrowLeftRight aria-hidden="true" />}
        unit={unit}
        onValueChange={(next) => {
          beginEditSession()
          setDirty(true)
          draftWRef.current = next
          setDraftW(next)
          if (!lockAspect) return
          const r = lockRatioRef.current ?? computeLockedAspectRatioFromCurrentSize({ widthPxU, heightPxU })
          if (!r) return
          lockRatioRef.current = r
          const out = computeLockedAspectOtherDimensionFromWidthInput({
            nextWidthInput: next,
            unit,
            ratio: { wPxU: r.w, hPxU: r.h },
          })
          if (!out) return
          draftHRef.current = out.nextHeightDisplay
          setDraftH(out.nextHeightDisplay)
        }}
        onFocus={() => {
          beginEditSession()
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit()
            setDirty(false)
          }
          if (e.key === "Escape") {
            setDirty(false)
            draftWRef.current = computedW
            draftHRef.current = computedH
            setDraftW(computedW)
            setDraftH(computedH)
          }
        }}
        onBlur={() => {
          if (ignoreNextBlurCommitRef.current) {
            ignoreNextBlurCommitRef.current = false
            return
          }
          commit()
          setDirty(false)
        }}
      />

      <SizeField
        value={dirty ? draftH : computedH}
        disabled={controlsDisabled}
        ariaLabel={`Image height (${unit})`}
        addon={<ArrowUpDown aria-hidden="true" />}
        unit={unit}
        onValueChange={(next) => {
          beginEditSession()
          setDirty(true)
          draftHRef.current = next
          setDraftH(next)
          if (!lockAspect) return
          const r = lockRatioRef.current ?? computeLockedAspectRatioFromCurrentSize({ widthPxU, heightPxU })
          if (!r) return
          lockRatioRef.current = r
          const out = computeLockedAspectOtherDimensionFromHeightInput({
            nextHeightInput: next,
            unit,
            ratio: { wPxU: r.w, hPxU: r.h },
          })
          if (!out) return
          draftWRef.current = out.nextWidthDisplay
          setDraftW(out.nextWidthDisplay)
        }}
        onFocus={() => {
          beginEditSession()
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit()
            setDirty(false)
          }
          if (e.key === "Escape") {
            setDirty(false)
            draftWRef.current = computedW
            draftHRef.current = computedH
            setDraftW(computedW)
            setDraftH(computedH)
          }
        }}
        onBlur={() => {
          if (ignoreNextBlurCommitRef.current) {
            ignoreNextBlurCommitRef.current = false
            return
          }
          commit()
          setDirty(false)
        }}
      />

      <PanelIconSlot>
        <RightPanelToggleIconButton
          type="button"
          active={lockAspect}
          aria-label={lockAspect ? "Unlock proportional image scaling" : "Lock proportional image scaling"}
          disabled={controlsDisabled}
          onPointerDownCapture={() => {
            // Prevent blur-commit firing when clicking the lock button.
            ignoreNextBlurCommitRef.current = true
          }}
          onClick={() => {
            setLockAspect((prev) => {
              const next = !prev
              lockRatioRef.current = next ? computeLockedAspectRatioFromCurrentSize({ widthPxU, heightPxU }) : null
              return next
            })
          }}
        >
          {lockAspect ? <Link2 className="h-[16px] w-[16px]" /> : <Unlink2 className="h-[16px] w-[16px]" />}
        </RightPanelToggleIconButton>
      </PanelIconSlot>
    </PanelTwoFieldRow>
  )
}

function ImagePositionInputs({
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
      <SizeField
        value={dirty ? draftX : computedX}
        disabled={controlsDisabled}
        ariaLabel={`Image x position (${unit})`}
        addon={<PositionAxisBadge label="x" />}
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

      <SizeField
        value={dirty ? draftY : computedY}
        disabled={controlsDisabled}
        ariaLabel={`Image y position (${unit})`}
        addon={<PositionAxisBadge label="Y" />}
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
  // Functional button bars (no selected visual state). We keep transient value just to satisfy Radix.
  const [alignXAction, setAlignXAction] = useState<string>("")
  const [alignYAction, setAlignYAction] = useState<string>("")

  return (
    <div className="space-y-4">
      {/* Keep row layout aligned with other right-panel rows:
          [field | field | icon-slot placeholder] */}
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

      {/* Alignment controls (like the screenshot): 3 icons under width and 3 under height */}
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
              <AlignLeft className="h-[16px] w-[16px]" />
            </ToggleGroupItem>
            <ToggleGroupItem value="center" size="sm" className="flex-1" aria-label="Align center" disabled={controlsDisabled}>
              <AlignCenter className="h-[16px] w-[16px]" />
            </ToggleGroupItem>
            <ToggleGroupItem value="right" size="sm" className="flex-1" aria-label="Align right" disabled={controlsDisabled}>
              <AlignRight className="h-[16px] w-[16px]" />
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
              <AlignVerticalJustifyStart className="h-[16px] w-[16px]" />
            </ToggleGroupItem>
            <ToggleGroupItem value="center" size="sm" className="flex-1" aria-label="Align middle" disabled={controlsDisabled}>
              <AlignVerticalJustifyCenter className="h-[16px] w-[16px]" />
            </ToggleGroupItem>
            <ToggleGroupItem value="bottom" size="sm" className="flex-1" aria-label="Align bottom" disabled={controlsDisabled}>
              <AlignVerticalJustifyEnd className="h-[16px] w-[16px]" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* icon-slot placeholder */}
        <PanelIconSlot />
      </PanelTwoFieldRow>
    </div>
  )
}

