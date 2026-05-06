"use client"

import { useState, useMemo } from "react"
import { Label } from "@/components/ui/label"
import { Field, FieldGroup } from "@/components/ui/field"
import {
  AppInput,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/ui/form-controls"
import { FilterFormFooter } from "./filter-forms/filter-form-footer"

export type PixelateFormData = {
  superpixelWidth: number
  superpixelHeight: number
  colorMode: "rgb" | "grayscale"
  numColors: number
}

type Props = {
  imageWidth: number
  imageHeight: number
  onCancel: () => void
  onApply: (data: PixelateFormData) => void
  busy?: boolean
}

export function PixelateForm({ imageWidth, imageHeight, onCancel, onApply, busy = false }: Props) {
  const [superpixelWidth, setSuperpixelWidth] = useState(10)
  const [superpixelHeight, setSuperpixelHeight] = useState(10)
  const [colorMode, setColorMode] = useState<"rgb" | "grayscale">("rgb")
  const [numColors, setNumColors] = useState(16)

  const pixelCountWidth = useMemo(
    () => Math.floor(imageWidth / Math.max(1, superpixelWidth)),
    [imageWidth, superpixelWidth]
  )
  
  const pixelCountHeight = useMemo(
    () => Math.floor(imageHeight / Math.max(1, superpixelHeight)),
    [imageHeight, superpixelHeight]
  )

  const isValid = useMemo(() => {
    return (
      superpixelWidth >= 1 &&
      superpixelHeight >= 1 &&
      numColors >= 2 &&
      numColors <= 256 &&
      pixelCountWidth >= 1 &&
      pixelCountHeight >= 1
    )
  }, [superpixelWidth, superpixelHeight, numColors, pixelCountWidth, pixelCountHeight])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || busy) return
    onApply({
      superpixelWidth,
      superpixelHeight,
      colorMode,
      numColors,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FieldGroup>
        <Field>
          <Label htmlFor="superpixel-width">Superpixel Width (px)</Label>
          <AppInput
            id="superpixel-width"
            type="number"
            min="1"
            value={superpixelWidth}
            onChange={(e) => setSuperpixelWidth(Number(e.target.value))}
            disabled={busy}
          />
        </Field>
        
        <Field>
          <Label htmlFor="superpixel-height">Superpixel Height (px)</Label>
          <AppInput
            id="superpixel-height"
            type="number"
            min="1"
            value={superpixelHeight}
            onChange={(e) => setSuperpixelHeight(Number(e.target.value))}
            disabled={busy}
          />
        </Field>

        <Field>
          <Label htmlFor="pixel-count-width">Pixel Count Width (calculated)</Label>
          <AppInput
            id="pixel-count-width"
            type="number"
            value={pixelCountWidth}
            readOnly
            disabled
          />
        </Field>

        <Field>
          <Label htmlFor="pixel-count-height">Pixel Count Height (calculated)</Label>
          <AppInput
            id="pixel-count-height"
            type="number"
            value={pixelCountHeight}
            readOnly
            disabled
          />
        </Field>

        <Field>
          <Label htmlFor="color-mode">Color Mode</Label>
          <AppSelect value={colorMode} onValueChange={(v) => setColorMode(v as "rgb" | "grayscale")} disabled={busy}>
            <AppSelectTrigger id="color-mode">
              <AppSelectValue />
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectItem value="rgb">RGB</AppSelectItem>
              <AppSelectItem value="grayscale">Grayscale</AppSelectItem>
            </AppSelectContent>
          </AppSelect>
        </Field>

        <Field>
          <Label htmlFor="num-colors">Number of Colors</Label>
          <AppInput
            id="num-colors"
            type="number"
            min="2"
            max="256"
            value={numColors}
            onChange={(e) => setNumColors(Number(e.target.value))}
            disabled={busy}
          />
        </Field>
      </FieldGroup>

      <FilterFormFooter onCancel={onCancel} isValid={isValid} busy={busy} />
    </form>
  )
}
