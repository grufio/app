"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Field, FieldGroup } from "@/components/ui/field"
import { Checkbox } from "@/components/ui/checkbox"

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

export function NumerateForm({ superpixelWidth, superpixelHeight, initialShowColors = true, onCancel, onApply, busy = false }: Props) {
  const [strokeWidth, setStrokeWidth] = useState(2)
  const [showColors, setShowColors] = useState(initialShowColors)

  const isValid = strokeWidth >= 1 && strokeWidth <= 20

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || busy) return
    onApply({ strokeWidth, showColors })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-md bg-muted p-3 text-sm space-y-1">
        <p className="font-medium">Superpixel Grid</p>
        <p className="text-muted-foreground">
          Using {superpixelWidth} × {superpixelHeight} px from Pixelate filter
        </p>
      </div>

      <FieldGroup>
        <Field>
          <Label htmlFor="stroke-width">Vector Line Width (px)</Label>
          <Input
            id="stroke-width"
            type="number"
            min="1"
            max="20"
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(Number(e.target.value))}
            disabled={busy}
          />
        </Field>

        <Field>
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
        </Field>
      </FieldGroup>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={!isValid || busy}>
          {busy ? "Applying..." : "Apply"}
        </Button>
      </div>
    </form>
  )
}
