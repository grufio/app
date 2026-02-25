"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Field, FieldGroup } from "@/components/ui/field"

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
          <Input
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
          <Input
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
          <Input
            id="pixel-count-width"
            type="number"
            value={pixelCountWidth}
            readOnly
            disabled
          />
        </Field>

        <Field>
          <Label htmlFor="pixel-count-height">Pixel Count Height (calculated)</Label>
          <Input
            id="pixel-count-height"
            type="number"
            value={pixelCountHeight}
            readOnly
            disabled
          />
        </Field>

        <Field>
          <Label htmlFor="color-mode">Color Mode</Label>
          <Select value={colorMode} onValueChange={(v) => setColorMode(v as "rgb" | "grayscale")} disabled={busy}>
            <SelectTrigger id="color-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rgb">RGB</SelectItem>
              <SelectItem value="grayscale">Grayscale</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <Label htmlFor="num-colors">Number of Colors</Label>
          <Input
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
