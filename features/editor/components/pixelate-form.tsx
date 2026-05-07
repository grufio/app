"use client"

/**
 * Phase 3.5 of the form-fields unification: migrate from shadcn
 * Field/FieldGroup/Label + AppInput to <FormField> with visible
 * labels. Same A11y model as the right-panel fields, just with
 * `labelVisuallyHidden={false}` (the default).
 *
 * The form has its own Apply submit button, so onCommit is a no-op
 * for the editable fields — onDraftChange drives the local state
 * that the validity check + submit handler read.
 */
import { useMemo, useState } from "react"
import type * as React from "react"

import { FormField, type SelectFieldOption } from "@/components/ui/form-controls"

const COLOR_MODE_OPTIONS: ReadonlyArray<SelectFieldOption> = [
  { value: "rgb", label: "RGB" },
  { value: "grayscale", label: "Grayscale" },
]
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
    onApply({ superpixelWidth, superpixelHeight, colorMode, numColors })
  }

  const setIntFromDraft = (set: (n: number) => void) => (raw: string) => {
    const n = Number(raw)
    if (Number.isFinite(n)) set(n)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex flex-col gap-7">
        <FormField
          variant="numeric"
          numericMode="int"
          label="Superpixel Width (px)"
          id="superpixel-width"
          value={String(superpixelWidth)}
          onCommit={setIntFromDraft(setSuperpixelWidth)}
          onDraftChange={setIntFromDraft(setSuperpixelWidth)}
          disabled={busy}
        />

        <FormField
          variant="numeric"
          numericMode="int"
          label="Superpixel Height (px)"
          id="superpixel-height"
          value={String(superpixelHeight)}
          onCommit={setIntFromDraft(setSuperpixelHeight)}
          onDraftChange={setIntFromDraft(setSuperpixelHeight)}
          disabled={busy}
        />

        <FormField
          variant="numeric"
          numericMode="int"
          label="Pixel Count Width (calculated)"
          id="pixel-count-width"
          value={String(pixelCountWidth)}
          onCommit={() => {}}
          disabled
          inputProps={{ readOnly: true }}
        />

        <FormField
          variant="numeric"
          numericMode="int"
          label="Pixel Count Height (calculated)"
          id="pixel-count-height"
          value={String(pixelCountHeight)}
          onCommit={() => {}}
          disabled
          inputProps={{ readOnly: true }}
        />

        <FormField
          variant="select"
          label="Color Mode"
          id="color-mode"
          value={colorMode}
          options={COLOR_MODE_OPTIONS}
          onCommit={(v) => setColorMode(v as "rgb" | "grayscale")}
          disabled={busy}
        />

        <FormField
          variant="numeric"
          numericMode="int"
          label="Number of Colors"
          id="num-colors"
          value={String(numColors)}
          onCommit={setIntFromDraft(setNumColors)}
          onDraftChange={setIntFromDraft(setNumColors)}
          disabled={busy}
          inputProps={{ min: 2, max: 256 }}
        />
      </div>

      <FilterFormFooter onCancel={onCancel} isValid={isValid} busy={busy} />
    </form>
  )
}
