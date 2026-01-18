"use client"

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
import { useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { NumericInput } from "@/components/shared/editor/numeric-input"
import { PanelField, PanelIconSlot, PanelTwoFieldRow } from "@/components/shared/editor/panel-layout"
import { clampPxFloat, fmt4, pxToUnit, snapNearInt, type Unit, unitToPx } from "@/lib/editor/units"
import { parseNumericInput } from "@/lib/editor/numeric"

type Props = {
  widthPx?: number
  heightPx?: number
  unit: Unit
  dpi: number
  disabled?: boolean
  onCommit: (widthPx: number, heightPx: number) => void
  onAlign: (opts: { x?: "left" | "center" | "right"; y?: "top" | "center" | "bottom" }) => void
}

/**
 * Image sizing panel.
 *
 * The UI displays image size in the artboard's *unit + DPI*,
 * but commits changes in pixels to the canvas (so scaling remains stable).
 */
export function ImagePanel({ widthPx, heightPx, unit, dpi, disabled, onCommit, onAlign }: Props) {
  const [dirty, setDirty] = useState(false)
  const ignoreNextBlurCommitRef = useRef(false)
  const lastEditedRef = useRef<"w" | "h" | null>(null)
  const lockRatioRef = useRef<number | null>(null)
  const draftWRef = useRef("")
  const draftHRef = useRef("")
  const [draftW, setDraftW] = useState("")
  const [draftH, setDraftH] = useState("")
  const [lockAspect, setLockAspect] = useState(false)
  // Functional button bars (no selected visual state). We keep transient value just to satisfy Radix.
  const [alignXAction, setAlignXAction] = useState<string>("")
  const [alignYAction, setAlignYAction] = useState<string>("")

  const computedW = useMemo(() => {
    if (!Number.isFinite(widthPx) || !Number.isFinite(dpi) || dpi <= 0) return ""
    return fmt4(snapNearInt(pxToUnit(Number(widthPx), unit, dpi)))
  }, [dpi, unit, widthPx])

  const computedH = useMemo(() => {
    if (!Number.isFinite(heightPx) || !Number.isFinite(dpi) || dpi <= 0) return ""
    return fmt4(snapNearInt(pxToUnit(Number(heightPx), unit, dpi)))
  }, [dpi, heightPx, unit])

  const ensureRatio = () => {
    const w = Number(widthPx)
    const h = Number(heightPx)
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null
    return w / h
  }

  const commit = () => {
    if (!Number.isFinite(dpi) || dpi <= 0) return
    // Use refs so blur/tab commits always see the latest typed value
    // (React state can be one render behind when events batch).
    const wVal = parseNumericInput(draftWRef.current)
    const hVal = parseNumericInput(draftHRef.current)

    // Always commit BOTH dimensions when both inputs are valid.
    // The canvas supports non-uniform scaling (scaleX/scaleY), so this is the
    // most predictable behavior: values you type are the values applied.
    if (!Number.isFinite(wVal) || wVal <= 0) return
    if (!Number.isFinite(hVal) || hVal <= 0) return
    const wPx = clampPxFloat(unitToPx(wVal, unit, dpi))
    const hPx = clampPxFloat(unitToPx(hVal, unit, dpi))
    onCommit(wPx, hPx)
  }

  return (
    <div className="space-y-4">
      {/* Keep row layout aligned with other right-panel rows:
          [field | field | icon-slot placeholder] */}
      <PanelTwoFieldRow>
        <PanelField icon={<ArrowLeftRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}>
          <NumericInput
            value={dirty ? draftW : computedW}
            onValueChange={(next) => {
              setDirty(true)
              lastEditedRef.current = "w"
              draftWRef.current = next
              setDraftW(next)
              if (!lockAspect) return
              const r = lockRatioRef.current ?? ensureRatio()
              if (!r) return
              lockRatioRef.current = r
              const w = parseNumericInput(next)
              if (!Number.isFinite(w) || w <= 0) return
              const nextH = fmt4(w / r)
              draftHRef.current = nextH
              setDraftH(nextH)
            }}
            disabled={disabled}
            aria-label={`Image width (${unit})`}
            className="h-6 w-full px-2 py-0 text-[12px] md:text-[12px] shadow-none"
            onFocus={() => {
              setDirty(true)
              lastEditedRef.current = "w"
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
        </PanelField>

        <PanelField icon={<ArrowUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}>
          <NumericInput
            value={dirty ? draftH : computedH}
            onValueChange={(next) => {
              setDirty(true)
              lastEditedRef.current = "h"
              draftHRef.current = next
              setDraftH(next)
              if (!lockAspect) return
              const r = lockRatioRef.current ?? ensureRatio()
              if (!r) return
              lockRatioRef.current = r
              const h = parseNumericInput(next)
              if (!Number.isFinite(h) || h <= 0) return
              const nextW = fmt4(h * r)
              draftWRef.current = nextW
              setDraftW(nextW)
            }}
            disabled={disabled}
            aria-label={`Image height (${unit})`}
            className="h-6 w-full px-2 py-0 text-[12px] md:text-[12px] shadow-none"
            onFocus={() => {
              setDirty(true)
              lastEditedRef.current = "h"
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
        </PanelField>

        <PanelIconSlot>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={lockAspect ? "Unlock proportional image scaling" : "Lock proportional image scaling"}
            aria-pressed={lockAspect}
            disabled={disabled}
            className={
              "h-6 w-6 " +
              (lockAspect
                ? "bg-black text-white hover:bg-black/90 hover:text-white"
                : "!bg-muted text-foreground hover:!bg-muted-foreground/10")
            }
            onPointerDownCapture={() => {
              // Prevent blur-commit firing when clicking the lock button.
              ignoreNextBlurCommitRef.current = true
            }}
            onClick={() => {
              setLockAspect((prev) => {
                const next = !prev
                lockRatioRef.current = next ? ensureRatio() : null
                return next
              })
            }}
          >
            {lockAspect ? <Link2 className="h-[16px] w-[16px]" /> : <Unlink2 className="h-[16px] w-[16px]" />}
          </Button>
        </PanelIconSlot>
      </PanelTwoFieldRow>

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
            <ToggleGroupItem value="left" size="sm" className="flex-1" aria-label="Align left" disabled={disabled}>
              <AlignLeft className="h-[16px] w-[16px]" />
            </ToggleGroupItem>
            <ToggleGroupItem value="center" size="sm" className="flex-1" aria-label="Align center" disabled={disabled}>
              <AlignCenter className="h-[16px] w-[16px]" />
            </ToggleGroupItem>
            <ToggleGroupItem value="right" size="sm" className="flex-1" aria-label="Align right" disabled={disabled}>
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
            <ToggleGroupItem value="top" size="sm" className="flex-1" aria-label="Align top" disabled={disabled}>
              <AlignVerticalJustifyStart className="h-[16px] w-[16px]" />
            </ToggleGroupItem>
            <ToggleGroupItem value="center" size="sm" className="flex-1" aria-label="Align middle" disabled={disabled}>
              <AlignVerticalJustifyCenter className="h-[16px] w-[16px]" />
            </ToggleGroupItem>
            <ToggleGroupItem value="bottom" size="sm" className="flex-1" aria-label="Align bottom" disabled={disabled}>
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

