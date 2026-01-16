"use client"

import { ArrowLeftRight, ArrowUpDown } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { Input } from "@/components/ui/input"
import { clampPx, fmt2, pxToUnit, type Unit, unitToPx } from "@/lib/editor/units"

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
  const [draftW, setDraftW] = useState("")
  const [draftH, setDraftH] = useState("")

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
    const wVal = Number(draftW)
    const hVal = Number(draftH)
    if (!Number.isFinite(wVal) || wVal <= 0) return
    if (!Number.isFinite(hVal) || hVal <= 0) return
    const wPx = clampPx(unitToPx(wVal, unit, dpi))
    const hPx = clampPx(unitToPx(hVal, unit, dpi))
    onCommit(wPx, hPx)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Input
            value={draftW}
            onChange={(e) => setDraftW(e.target.value)}
            disabled={disabled}
            inputMode="decimal"
            aria-label={`Image width (${unit})`}
            className="h-6 w-full px-2 py-0 text-[12px] md:text-[12px] shadow-none"
            onFocus={() => {
              dirtyRef.current = true
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
            onChange={(e) => setDraftH(e.target.value)}
            disabled={disabled}
            inputMode="decimal"
            aria-label={`Image height (${unit})`}
            className="h-6 w-full px-2 py-0 text-[12px] md:text-[12px] shadow-none"
            onFocus={() => {
              dirtyRef.current = true
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
      </div>
    </div>
  )
}

