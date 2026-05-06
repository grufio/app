"use client"

import { useState, useMemo } from "react"
import { AppInput } from "@/components/ui/form-controls"
import { Label } from "@/components/ui/label"
import { Field, FieldGroup } from "@/components/ui/field"
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
    return (
      threshold1 >= 0 &&
      threshold2 > threshold1 &&
      lineThickness >= 1 &&
      lineThickness <= 10
    )
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FieldGroup>
        <Field>
          <Label htmlFor="threshold1">Low Threshold</Label>
          <AppInput
            id="threshold1"
            type="number"
            min={0}
            max={500}
            value={threshold1}
            onChange={(e) => setThreshold1(Number(e.target.value))}
            disabled={busy}
          />
          <p className="text-xs text-muted-foreground">Lower value = more edges detected (0-500)</p>
        </Field>

        <Field>
          <Label htmlFor="threshold2">High Threshold</Label>
          <AppInput
            id="threshold2"
            type="number"
            min={0}
            max={500}
            value={threshold2}
            onChange={(e) => setThreshold2(Number(e.target.value))}
            disabled={busy}
          />
          <p className="text-xs text-muted-foreground">Must be higher than low threshold</p>
        </Field>

        <Field>
          <Label htmlFor="lineThickness">Line Thickness</Label>
          <AppInput
            id="lineThickness"
            type="number"
            min={1}
            max={10}
            value={lineThickness}
            onChange={(e) => setLineThickness(Number(e.target.value))}
            disabled={busy}
          />
          <p className="text-xs text-muted-foreground">Thickness in pixels (1-10)</p>
        </Field>

        <Field>
          <Label htmlFor="blurAmount">Blur Amount</Label>
          <AppInput
            id="blurAmount"
            type="number"
            min={0}
            max={20}
            value={blurAmount}
            onChange={(e) => setBlurAmount(Number(e.target.value))}
            disabled={busy}
          />
          <p className="text-xs text-muted-foreground">Smoothing before edge detection (0-20, 0=no blur)</p>
        </Field>

        <Field>
          <Label htmlFor="minContourArea">Min. Detail Size</Label>
          <AppInput
            id="minContourArea"
            type="number"
            min={0}
            max={10000}
            step={50}
            value={minContourArea}
            onChange={(e) => setMinContourArea(Number(e.target.value))}
            disabled={busy}
          />
          <p className="text-xs text-muted-foreground">Minimum contour area in pixels (removes small details)</p>
        </Field>

        <Field>
          <Label htmlFor="smoothness">Smoothness</Label>
          <AppInput
            id="smoothness"
            type="number"
            min={0}
            max={0.05}
            step={0.001}
            value={smoothness}
            onChange={(e) => setSmoothness(Number(e.target.value))}
            disabled={busy}
          />
          <p className="text-xs text-muted-foreground">Curve smoothing (0=sharp corners, 0.02=very smooth)</p>
        </Field>

        <Field>
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
        </Field>
      </FieldGroup>

      <FilterFormFooter onCancel={onCancel} isValid={isValid} busy={busy} applyingLabel="Processing..." />
    </form>
  )
}
