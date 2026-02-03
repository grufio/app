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

import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { IconNumericField } from "./fields/icon-numeric-field"
import { PanelIconSlot, PanelTwoFieldRow } from "./panel-layout"
import { pxUToUnitDisplayFixed, type Unit } from "@/lib/editor/units"
import {
  computeLockedAspectOtherDimensionFromHeightInput,
  computeLockedAspectOtherDimensionFromWidthInput,
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
}: {
  value: string
  onValueChange: (next: string) => void
  disabled: boolean
  ariaLabel: string
  onFocus: () => void
  onKeyDown: KeyboardEventHandler<HTMLInputElement>
  onBlur: () => void
  addon: ReactNode
}) {
  return (
    <IconNumericField
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      ariaLabel={ariaLabel}
      icon={addon}
      mode="float"
      numericProps={{
        onFocus,
        onKeyDown,
        onBlur,
      }}
    />
  )
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
    return pxUToUnitDisplayFixed(widthPxU, unit)
  }, [ready, unit, widthPxU])

  const computedH = useMemo(() => {
    if (!ready) return ""
    if (!heightPxU) return ""
    return pxUToUnitDisplayFixed(heightPxU, unit)
  }, [heightPxU, ready, unit])

  const commit = () => {
    // Use refs so blur/tab commits always see the latest typed value
    // (React state can be one render behind when events batch).
    // Invariants: docs/specs/sizing-invariants.mdx (round once at input conversion).
    const parsed = computeImageSizeCommit({ ready, draftW: draftWRef.current, draftH: draftHRef.current, unit })
    if (!parsed) return
    onCommit(parsed.wPxU, parsed.hPxU)
  }

  return (
    <PanelTwoFieldRow>
      <SizeField
        value={dirty ? draftW : computedW}
        disabled={controlsDisabled}
        ariaLabel={`Image width (${unit})`}
        addon={<ArrowLeftRight aria-hidden="true" />}
        onValueChange={(next) => {
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
          if (!ready) return
          if (dirty) return
          setDirty(true)
          draftWRef.current = computedW
          draftHRef.current = computedH
          setDraftW(computedW)
          setDraftH(computedH)
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
        onValueChange={(next) => {
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
          if (!ready) return
          if (dirty) return
          setDirty(true)
          draftWRef.current = computedW
          draftHRef.current = computedH
          setDraftW(computedW)
          setDraftH(computedH)
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
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={lockAspect ? "Unlock proportional image scaling" : "Lock proportional image scaling"}
          aria-pressed={lockAspect}
          disabled={controlsDisabled}
          className={
            lockAspect
              ? "bg-black text-white hover:bg-black/90 hover:text-white"
              : "!bg-muted text-foreground hover:!bg-muted-foreground/10"
          }
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
        </Button>
      </PanelIconSlot>
    </PanelTwoFieldRow>
  )
}

type Props = {
  widthPxU?: bigint
  heightPxU?: bigint
  unit: Unit
  /**
   * When false, inputs stay empty and commits are ignored.
   * Use this to prevent "flash" / drift while upstream meta/state is still loading.
   */
  ready?: boolean
  disabled?: boolean
  onCommit: (widthPxU: bigint, heightPxU: bigint) => void
  onAlign: (opts: { x?: "left" | "center" | "right"; y?: "top" | "center" | "bottom" }) => void
}

/**
 * Image sizing panel.
 *
 * The UI displays image size in the artboard's unit,
 * but commits changes in pixels to the canvas (so scaling remains stable).
 */
export function ImagePanel({ widthPxU, heightPxU, unit, ready = true, disabled, onCommit, onAlign }: Props) {
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

