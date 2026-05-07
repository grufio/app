"use client"

import { useMemo, useState } from "react"
import type * as React from "react"

import { Label } from "@/components/ui/label"
import { FormField } from "@/components/ui/form-controls"
import { FilterFormFooter } from "./filter-forms/filter-form-footer"

export type LineArtFormData = {
  threshold1: number
  threshold2: number
  lineThickness: number
  invert: boolean
  blurAmount: number
  minContourArea: number
  smoothness: number
}

type Props = {
  onCancel: () => void
  onApply: (data: LineArtFormData) => void
  busy?: boolean
}

export function LineArtForm({ onCancel, onApply, busy = false }: Props) {
  const [threshold1, setThreshold1] = useState(50)
  const [threshold2, setThreshold2] = useState(200)
  const [lineThickness, setLineThickness] = useState(2)
  const [invert, setInvert] = useState(true)
  const [blurAmount, setBlurAmount] = useState(3)
  const [minContourArea, setMinContourArea] = useState(500)
  const [smoothness, setSmoothness] = useState(0.002)

  const isValid = useMemo(() => {
    return threshold1 >= 0 && threshold2 > threshold1 && lineThickness >= 1 && lineThickness <= 10
  }, [threshold1, threshold2, lineThickness])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || busy) return
    onApply({
      threshold1,
      threshold2,
      lineThickness,
      invert,
      blurAmount,
      minContourArea,
      smoothness,
    })
  }

  const setNumeric = (set: (n: number) => void) => (raw: string) => {
    const n = Number(raw)
    if (Number.isFinite(n)) set(n)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex flex-col gap-7">
        <FormField
          variant="numeric"
          numericMode="int"
          label="Low Threshold"
          id="threshold1"
          value={String(threshold1)}
          onCommit={setNumeric(setThreshold1)}
          onDraftChange={setNumeric(setThreshold1)}
          description="Lower value = more edges detected (0-500)"
          disabled={busy}
          inputProps={{ min: 0, max: 500 }}
        />

        <FormField
          variant="numeric"
          numericMode="int"
          label="High Threshold"
          id="threshold2"
          value={String(threshold2)}
          onCommit={setNumeric(setThreshold2)}
          onDraftChange={setNumeric(setThreshold2)}
          description="Must be higher than low threshold"
          disabled={busy}
          inputProps={{ min: 0, max: 500 }}
        />

        <FormField
          variant="numeric"
          numericMode="int"
          label="Line Thickness"
          id="lineThickness"
          value={String(lineThickness)}
          onCommit={setNumeric(setLineThickness)}
          onDraftChange={setNumeric(setLineThickness)}
          description="Thickness in pixels (1-10)"
          disabled={busy}
          inputProps={{ min: 1, max: 10 }}
        />

        <FormField
          variant="numeric"
          numericMode="int"
          label="Blur Amount"
          id="blurAmount"
          value={String(blurAmount)}
          onCommit={setNumeric(setBlurAmount)}
          onDraftChange={setNumeric(setBlurAmount)}
          description="Smoothing before edge detection (0-20, 0=no blur)"
          disabled={busy}
          inputProps={{ min: 0, max: 20 }}
        />

        <FormField
          variant="numeric"
          numericMode="int"
          label="Min. Detail Size"
          id="minContourArea"
          value={String(minContourArea)}
          onCommit={setNumeric(setMinContourArea)}
          onDraftChange={setNumeric(setMinContourArea)}
          description="Minimum contour area in pixels (removes small details)"
          disabled={busy}
          inputProps={{ min: 0, max: 10000, step: 50 }}
        />

        <FormField
          variant="numeric"
          numericMode="decimal"
          label="Smoothness"
          id="smoothness"
          value={String(smoothness)}
          onCommit={setNumeric(setSmoothness)}
          onDraftChange={setNumeric(setSmoothness)}
          description="Curve smoothing (0=sharp corners, 0.02=very smooth)"
          disabled={busy}
          inputProps={{ min: 0, max: 0.05, step: 0.001 }}
        />

        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <input
              id="invert"
              type="checkbox"
              checked={invert}
              onChange={(e) => setInvert(e.target.checked)}
              disabled={busy}
              className="h-4 w-4"
            />
            <Label htmlFor="invert" className="cursor-pointer font-normal">
              Black lines on white background
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">Unchecked = white lines on black</p>
        </div>
      </div>

      <FilterFormFooter onCancel={onCancel} isValid={isValid} busy={busy} applyingLabel="Processing..." />
    </form>
  )
}
