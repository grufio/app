"use client"

import { useMemo, useState } from "react"
import type * as React from "react"

import { Label } from "@/components/ui/label"
import { FormField } from "@/components/ui/form-controls"
import { lineartFilter, lineartSchema, type LineartParams } from "@/lib/editor/filters/lineart"
import { FilterFormFooter } from "./filter-forms/filter-form-footer"

const DEFAULT_PARAMS = lineartSchema.parse({})

export type LineArtFormData = LineartParams

type Props = {
  onCancel: () => void
  onApply: (data: LineArtFormData) => void
  busy?: boolean
}

export function LineArtForm({ onCancel, onApply, busy = false }: Props) {
  const [threshold1, setThreshold1] = useState(DEFAULT_PARAMS.threshold1)
  const [threshold2, setThreshold2] = useState(DEFAULT_PARAMS.threshold2)
  const [lineThickness, setLineThickness] = useState(DEFAULT_PARAMS.line_thickness)
  const [invert, setInvert] = useState(DEFAULT_PARAMS.invert)
  const [blurAmount, setBlurAmount] = useState(DEFAULT_PARAMS.blur_amount)
  const [minContourArea, setMinContourArea] = useState(DEFAULT_PARAMS.min_contour_area)
  const [smoothness, setSmoothness] = useState(DEFAULT_PARAMS.smoothness)

  const isValid = useMemo(() => {
    return lineartSchema.safeParse({
      threshold1,
      threshold2,
      line_thickness: lineThickness,
      blur_amount: blurAmount,
      min_contour_area: minContourArea,
      invert,
      smoothness,
    }).success
  }, [threshold1, threshold2, lineThickness, blurAmount, minContourArea, invert, smoothness])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || busy) return
    onApply({
      threshold1,
      threshold2,
      line_thickness: lineThickness,
      invert,
      blur_amount: blurAmount,
      min_contour_area: minContourArea,
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
          label={lineartFilter.ui.threshold1.label}
          id="threshold1"
          value={String(threshold1)}
          onCommit={setNumeric(setThreshold1)}
          onDraftChange={setNumeric(setThreshold1)}
          description={lineartFilter.ui.threshold1.description}
          disabled={busy}
          inputProps={{ min: lineartFilter.ui.threshold1.min, max: lineartFilter.ui.threshold1.max }}
        />

        <FormField
          variant="numeric"
          numericMode="int"
          label={lineartFilter.ui.threshold2.label}
          id="threshold2"
          value={String(threshold2)}
          onCommit={setNumeric(setThreshold2)}
          onDraftChange={setNumeric(setThreshold2)}
          description={lineartFilter.ui.threshold2.description}
          disabled={busy}
          inputProps={{ min: lineartFilter.ui.threshold2.min, max: lineartFilter.ui.threshold2.max }}
        />

        <FormField
          variant="numeric"
          numericMode="int"
          label={lineartFilter.ui.line_thickness.label}
          id="lineThickness"
          value={String(lineThickness)}
          onCommit={setNumeric(setLineThickness)}
          onDraftChange={setNumeric(setLineThickness)}
          description={lineartFilter.ui.line_thickness.description}
          disabled={busy}
          inputProps={{ min: lineartFilter.ui.line_thickness.min, max: lineartFilter.ui.line_thickness.max }}
        />

        <FormField
          variant="numeric"
          numericMode="int"
          label={lineartFilter.ui.blur_amount.label}
          id="blurAmount"
          value={String(blurAmount)}
          onCommit={setNumeric(setBlurAmount)}
          onDraftChange={setNumeric(setBlurAmount)}
          description={lineartFilter.ui.blur_amount.description}
          disabled={busy}
          inputProps={{ min: lineartFilter.ui.blur_amount.min, max: lineartFilter.ui.blur_amount.max }}
        />

        <FormField
          variant="numeric"
          numericMode="int"
          label={lineartFilter.ui.min_contour_area.label}
          id="minContourArea"
          value={String(minContourArea)}
          onCommit={setNumeric(setMinContourArea)}
          onDraftChange={setNumeric(setMinContourArea)}
          description={lineartFilter.ui.min_contour_area.description}
          disabled={busy}
          inputProps={{ min: lineartFilter.ui.min_contour_area.min, max: lineartFilter.ui.min_contour_area.max, step: lineartFilter.ui.min_contour_area.step }}
        />

        <FormField
          variant="numeric"
          numericMode="decimal"
          label={lineartFilter.ui.smoothness.label}
          id="smoothness"
          value={String(smoothness)}
          onCommit={setNumeric(setSmoothness)}
          onDraftChange={setNumeric(setSmoothness)}
          description={lineartFilter.ui.smoothness.description}
          disabled={busy}
          inputProps={{ min: lineartFilter.ui.smoothness.min, max: lineartFilter.ui.smoothness.max, step: lineartFilter.ui.smoothness.step }}
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
              {lineartFilter.ui.invert.label}
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">{lineartFilter.ui.invert.description}</p>
        </div>
      </div>

      <FilterFormFooter onCancel={onCancel} isValid={isValid} busy={busy} applyingLabel="Processing..." />
    </form>
  )
}
