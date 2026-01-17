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
import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { clampPx, fmt2, pxToUnit, type Unit, unitToPx } from "@/lib/editor/units"
import { parseNumericInput, sanitizeNumericInput } from "@/lib/editor/numeric"

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
 * The UI always displays image size in the *same unit + DPI* as the artboard,
 * but commits changes in pixels to the canvas (so scaling remains stable).
 */
export function ImagePanel({ widthPx, heightPx, unit, dpi, disabled, onCommit, onAlign }: Props) {
  const dirtyRef = useRef(false)
  const ignoreNextBlurCommitRef = useRef(false)
  const lastEditedRef = useRef<"w" | "h" | null>(null)
  const lockRatioRef = useRef<number | null>(null)
  const [draftW, setDraftW] = useState("")
  const [draftH, setDraftH] = useState("")
  const [lockAspect, setLockAspect] = useState(false)
  // Functional button bars (no selected visual state). We keep transient value just to satisfy Radix.
  const [alignXAction, setAlignXAction] = useState<string>("")
  const [alignYAction, setAlignYAction] = useState<string>("")

  const computedW = useMemo(() => {
    if (!Number.isFinite(widthPx) || !Number.isFinite(dpi) || dpi <= 0) return ""
    return fmt2(pxToUnit(Number(widthPx), unit, dpi))
  }, [dpi, unit, widthPx])

  const computedH = useMemo(() => {
    if (!Number.isFinite(heightPx) || !Number.isFinite(dpi) || dpi <= 0) return ""
    return fmt2(pxToUnit(Number(heightPx), unit, dpi))
  }, [dpi, heightPx, unit])

  // Sync drafts to external changes (e.g. canvas updates) when user isn't editing.
  useEffect(() => {
    if (dirtyRef.current) return
    setDraftW(computedW)
    setDraftH(computedH)
  }, [computedH, computedW])

  const ensureRatio = () => {
    const w = Number(widthPx)
    const h = Number(heightPx)
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null
    return w / h
  }

  const commit = () => {
    if (!Number.isFinite(dpi) || dpi <= 0) return
    const wVal = parseNumericInput(draftW)
    const hVal = parseNumericInput(draftH)

    // Always commit BOTH dimensions when both inputs are valid.
    // The canvas supports non-uniform scaling (scaleX/scaleY), so this is the
    // most predictable behavior: values you type are the values applied.
    if (!Number.isFinite(wVal) || wVal <= 0) return
    if (!Number.isFinite(hVal) || hVal <= 0) return
    const wPx = clampPx(unitToPx(wVal, unit, dpi))
    const hPx = clampPx(unitToPx(hVal, unit, dpi))
    onCommit(wPx, hPx)
  }

  return (
    <div className="space-y-4">
      {/* Keep row layout aligned with other right-panel rows:
          [field | field | icon-slot placeholder] */}
      <div className="grid grid-cols-[1fr_1fr_auto] gap-3">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Input
            value={draftW}
            onChange={(e) => {
              dirtyRef.current = true
              lastEditedRef.current = "w"
              const next = sanitizeNumericInput(e.target.value, "decimal")
              setDraftW(next)
              if (!lockAspect) return
              const r = lockRatioRef.current ?? ensureRatio()
              if (!r) return
              lockRatioRef.current = r
              const w = parseNumericInput(next)
              if (!Number.isFinite(w) || w <= 0) return
              setDraftH(fmt2(w / r))
            }}
            disabled={disabled}
            inputMode="decimal"
            aria-label={`Image width (${unit})`}
            className="h-6 w-full px-2 py-0 text-[12px] md:text-[12px] shadow-none"
            onFocus={() => {
              dirtyRef.current = true
              lastEditedRef.current = "w"
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                dirtyRef.current = false
                commit()
              }
              if (e.key === "Escape") {
                dirtyRef.current = false
                setDraftW(computedW)
                setDraftH(computedH)
              }
            }}
            onBlur={() => {
              if (ignoreNextBlurCommitRef.current) {
                ignoreNextBlurCommitRef.current = false
                return
              }
              dirtyRef.current = false
              commit()
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <ArrowUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Input
            value={draftH}
            onChange={(e) => {
              dirtyRef.current = true
              lastEditedRef.current = "h"
              const next = sanitizeNumericInput(e.target.value, "decimal")
              setDraftH(next)
              if (!lockAspect) return
              const r = lockRatioRef.current ?? ensureRatio()
              if (!r) return
              lockRatioRef.current = r
              const h = parseNumericInput(next)
              if (!Number.isFinite(h) || h <= 0) return
              setDraftW(fmt2(h * r))
            }}
            disabled={disabled}
            inputMode="decimal"
            aria-label={`Image height (${unit})`}
            className="h-6 w-full px-2 py-0 text-[12px] md:text-[12px] shadow-none"
            onFocus={() => {
              dirtyRef.current = true
              lastEditedRef.current = "h"
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                dirtyRef.current = false
                commit()
              }
              if (e.key === "Escape") {
                dirtyRef.current = false
                setDraftW(computedW)
                setDraftH(computedH)
              }
            }}
            onBlur={() => {
              if (ignoreNextBlurCommitRef.current) {
                ignoreNextBlurCommitRef.current = false
                return
              }
              dirtyRef.current = false
              commit()
            }}
          />
        </div>
        {/* icon-slot: lock aspect for image scaling */}
        <div className="flex items-center justify-end">
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
            {lockAspect ? <Link2 className="size-4" /> : <Unlink2 className="size-4" />}
          </Button>
        </div>
      </div>

      {/* Alignment controls (like the screenshot): 3 icons under width and 3 under height */}
      <div className="grid grid-cols-[1fr_1fr_auto] gap-3">
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
              <AlignLeft className="size-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="center" size="sm" className="flex-1" aria-label="Align center" disabled={disabled}>
              <AlignCenter className="size-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="right" size="sm" className="flex-1" aria-label="Align right" disabled={disabled}>
              <AlignRight className="size-4" />
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
              <AlignVerticalJustifyStart className="size-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="center" size="sm" className="flex-1" aria-label="Align middle" disabled={disabled}>
              <AlignVerticalJustifyCenter className="size-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="bottom" size="sm" className="flex-1" aria-label="Align bottom" disabled={disabled}>
              <AlignVerticalJustifyEnd className="size-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* icon-slot placeholder */}
        <div className="h-6 w-6" aria-hidden="true" />
      </div>
    </div>
  )
}

