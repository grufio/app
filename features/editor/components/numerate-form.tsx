"use client"

import { useState } from "react"
import type * as React from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { FormField } from "@/components/ui/form-controls"
import { FilterFormFooter } from "./filter-forms/filter-form-footer"

export type NumerateFormData = {
  strokeWidth: number
  showColors: boolean
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
  initialShowColors = true,
  onCancel,
  onApply,
  busy = false,
}: Props) {
  const [strokeWidth, setStrokeWidth] = useState(2)
  const [showColors, setShowColors] = useState(initialShowColors)

  const isValid = strokeWidth >= 1 && strokeWidth <= 20

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || busy) return
    onApply({ strokeWidth, showColors })
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
          inputProps={{ min: 1, max: 20 }}
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
