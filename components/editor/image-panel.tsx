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
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

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
}

/**
 * Image sizing panel.
 *
 * The UI always displays image size in the *same unit + DPI* as the artboard,
 * but commits changes in pixels to the canvas (so scaling remains stable).
 */
export function ImagePanel({ widthPx, heightPx, unit, dpi, disabled, onCommit }: Props) {
  const dirtyRef = useRef(false)
  const lastEditedRef = useRef<"w" | "h" | null>(null)
  const [draftW, setDraftW] = useState("")
  const [draftH, setDraftH] = useState("")
  const [alignX, setAlignX] = useState<"left" | "center" | "right">("center")
  const [alignY, setAlignY] = useState<"top" | "center" | "bottom">("center")

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

  const commit = () => {
    if (!Number.isFinite(dpi) || dpi <= 0) return
    const wVal = parseNumericInput(draftW)
    const hVal = parseNumericInput(draftH)

    // IMPORTANT:
    // The canvas keeps aspect ratio and prefers width when both are provided.
    // If the user edits height, we must commit *height only* (and vice versa),
    // otherwise the old width can "win" and produce confusing results.
    const edited = lastEditedRef.current
    if (edited === "h") {
      if (!Number.isFinite(hVal) || hVal <= 0) return
      const hPx = clampPx(unitToPx(hVal, unit, dpi))
      onCommit(Number.NaN, hPx)
      return
    }

    // default to width
    if (!Number.isFinite(wVal) || wVal <= 0) return
    const wPx = clampPx(unitToPx(wVal, unit, dpi))
    onCommit(wPx, Number.NaN)
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
              setDraftW(sanitizeNumericInput(e.target.value, "decimal"))
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
              dirtyRef.current = false
              commit()
              // Re-sync to computed values (aspect ratio lock may adjust one side)
              queueMicrotask(() => {
                setDraftW(computedW)
                setDraftH(computedH)
              })
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
              setDraftH(sanitizeNumericInput(e.target.value, "decimal"))
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
              dirtyRef.current = false
              commit()
              queueMicrotask(() => {
                setDraftW(computedW)
                setDraftH(computedH)
              })
            }}
          />
        </div>
        {/* icon-slot placeholder */}
        <div className="h-6 w-6" aria-hidden="true" />
      </div>

      {/* Alignment controls (like the screenshot): 3 icons under width and 3 under height */}
      <div className="grid grid-cols-[1fr_1fr_auto] gap-3">
        <div className="flex items-center">
          <ToggleGroup
            type="single"
            value={alignX}
            onValueChange={(v) => {
              if (!v) return
              setAlignX(v as typeof alignX)
            }}
            className="w-full justify-start"
          >
            <ToggleGroupItem value="left" size="sm" aria-label="Align left" disabled={disabled}>
              <AlignLeft className="size-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem value="center" size="sm" aria-label="Align center" disabled={disabled}>
              <AlignCenter className="size-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem value="right" size="sm" aria-label="Align right" disabled={disabled}>
              <AlignRight className="size-3.5" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="flex items-center">
          <ToggleGroup
            type="single"
            value={alignY}
            onValueChange={(v) => {
              if (!v) return
              setAlignY(v as typeof alignY)
            }}
            className="w-full justify-start"
          >
            <ToggleGroupItem value="top" size="sm" aria-label="Align top" disabled={disabled}>
              <AlignVerticalJustifyStart className="size-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem value="center" size="sm" aria-label="Align middle" disabled={disabled}>
              <AlignVerticalJustifyCenter className="size-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem value="bottom" size="sm" aria-label="Align bottom" disabled={disabled}>
              <AlignVerticalJustifyEnd className="size-3.5" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* icon-slot placeholder */}
        <div className="h-6 w-6" aria-hidden="true" />
      </div>
    </div>
  )
}

