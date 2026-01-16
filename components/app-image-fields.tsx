"use client"

import { ArrowLeftRight, ArrowUpDown } from "lucide-react"
import { useState } from "react"

import { Input } from "@/components/ui/input"

type Unit = "mm" | "cm" | "pt" | "px"

function pxToUnit(px: number, unit: Unit, dpi: number): number {
  if (unit === "px") return px
  const inches = px / dpi
  if (unit === "mm") return inches * 25.4
  if (unit === "cm") return inches * 2.54
  if (unit === "pt") return inches * 72
  return px
}

function unitToPx(value: number, unit: Unit, dpi: number): number {
  if (unit === "px") return value
  if (unit === "mm") return (value / 25.4) * dpi
  if (unit === "cm") return (value / 2.54) * dpi
  if (unit === "pt") return (value / 72) * dpi
  return value
}

export function ImageFields({
  widthPx,
  heightPx,
  unit,
  dpi,
  disabled,
  onCommit,
}: {
  widthPx?: number
  heightPx?: number
  unit: Unit
  dpi: number
  disabled?: boolean
  onCommit: (widthPx: number, heightPx: number) => void
}) {
  const [draftW, setDraftW] = useState(() => {
    if (!Number.isFinite(widthPx) || !Number.isFinite(dpi) || dpi <= 0) return ""
    return String(Math.round(pxToUnit(Number(widthPx), unit, dpi) * 100) / 100)
  })
  const [draftH, setDraftH] = useState(() => {
    if (!Number.isFinite(heightPx) || !Number.isFinite(dpi) || dpi <= 0) return ""
    return String(Math.round(pxToUnit(Number(heightPx), unit, dpi) * 100) / 100)
  })

  const commit = () => {
    if (!Number.isFinite(dpi) || dpi <= 0) return
    const wVal = Number(draftW)
    const hVal = Number(draftH)
    if (!Number.isFinite(wVal) || wVal <= 0) return
    if (!Number.isFinite(hVal) || hVal <= 0) return
    const wPx = Math.max(1, Math.round(unitToPx(wVal, unit, dpi)))
    const hPx = Math.max(1, Math.round(unitToPx(hVal, unit, dpi)))
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
            aria-label="Image width (px)"
            className="h-6 w-full px-2 py-0 text-[12px] md:text-[12px] shadow-none"
            onKeyDown={(e) => {
              if (e.key === "Enter") commit()
            }}
            onBlur={commit}
          />
        </div>
        <div className="flex items-center gap-2">
          <ArrowUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Input
            value={draftH}
            onChange={(e) => setDraftH(e.target.value)}
            disabled={disabled}
            inputMode="decimal"
            aria-label="Image height (px)"
            className="h-6 w-full px-2 py-0 text-[12px] md:text-[12px] shadow-none"
            onKeyDown={(e) => {
              if (e.key === "Enter") commit()
            }}
            onBlur={commit}
          />
        </div>
      </div>
    </div>
  )
}

