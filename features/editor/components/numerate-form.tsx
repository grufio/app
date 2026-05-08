"use client"

import { useState } from "react"
import type * as React from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { FormField } from "@/components/ui/form-controls"
import { numerateFilter, numerateSchema } from "@/lib/editor/filters/numerate"
import { FilterFormFooter } from "./filter-forms/filter-form-footer"

const DEFAULT_PARAMS = numerateSchema.parse({})

export type NumerateFormData = {
  stroke_width: number
  show_colors: boolean
}

type Props = {
  superpixelWidth: number
  superpixelHeight: number
  initialShowColors?: boolean
  onCancel: () => void
  onApply: (data: NumerateFormData) => void
  busy?: boolean
}

export function NumerateForm({
  superpixelWidth,
  superpixelHeight,
  initialShowColors = DEFAULT_PARAMS.show_colors,
  onCancel,
  onApply,
  busy = false,
}: Props) {
  const [strokeWidth, setStrokeWidth] = useState(DEFAULT_PARAMS.stroke_width)
  const [showColors, setShowColors] = useState(initialShowColors)

  const isValid = numerateSchema.safeParse({
    superpixel_width: superpixelWidth,
    superpixel_height: superpixelHeight,
    stroke_width: strokeWidth,
    show_colors: showColors,
  }).success

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || busy) return
    onApply({ stroke_width: strokeWidth, show_colors: showColors })
  }

  const setIntStroke = (raw: string) => {
    const n = Number(raw)
    if (Number.isFinite(n)) setStrokeWidth(n)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-md bg-muted p-3 text-sm space-y-1">
        <p className="font-medium">Superpixel Grid</p>
        <p className="text-muted-foreground">
          Using {superpixelWidth} × {superpixelHeight} px from Pixelate filter
        </p>
      </div>

      <div className="flex flex-col gap-7">
        <FormField
          variant="numeric"
          numericMode="int"
          label="Vector Line Width (px)"
          id="stroke-width"
          value={String(strokeWidth)}
          onCommit={setIntStroke}
          onDraftChange={setIntStroke}
          disabled={busy}
          inputProps={numerateFilter.ui.stroke_width}
        />

        <div className="flex items-center space-x-2">
          <Checkbox
            id="show-colors"
            checked={showColors}
            onCheckedChange={(checked) => setShowColors(checked === true)}
            disabled={busy}
          />
          <Label htmlFor="show-colors" className="font-normal cursor-pointer">
            Show Colors
          </Label>
        </div>
      </div>

      <FilterFormFooter onCancel={onCancel} isValid={isValid} busy={busy} />
    </form>
  )
}
