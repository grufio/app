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

import { FormField } from "@/components/ui/form-controls"
import { pixelateFilter, pixelateSchema, type PixelateParams } from "@/lib/editor/filters/pixelate"

import { FilterFormFooter } from "./filter-forms/filter-form-footer"

const DEFAULT_PARAMS = pixelateSchema.parse({})

export type PixelateFormData = PixelateParams

type Props = {
  imageWidth: number
  imageHeight: number
  onCancel: () => void
  onApply: (data: PixelateFormData) => void
  busy?: boolean
}

export function PixelateForm({ imageWidth, imageHeight, onCancel, onApply, busy = false }: Props) {
  const [superpixelWidth, setSuperpixelWidth] = useState(DEFAULT_PARAMS.superpixel_width)
  const [superpixelHeight, setSuperpixelHeight] = useState(DEFAULT_PARAMS.superpixel_height)
  const [colorMode, setColorMode] = useState<"rgb" | "grayscale">(DEFAULT_PARAMS.color_mode)
  const [numColors, setNumColors] = useState(DEFAULT_PARAMS.num_colors)

  const pixelCountWidth = useMemo(
    () => Math.floor(imageWidth / Math.max(1, superpixelWidth)),
    [imageWidth, superpixelWidth]
  )

  const pixelCountHeight = useMemo(
    () => Math.floor(imageHeight / Math.max(1, superpixelHeight)),
    [imageHeight, superpixelHeight]
  )

  const isValid = useMemo(() => {
    const parsed = pixelateSchema.safeParse({
      superpixel_width: superpixelWidth,
      superpixel_height: superpixelHeight,
      color_mode: colorMode,
      num_colors: numColors,
    })
    return parsed.success && pixelCountWidth >= 1 && pixelCountHeight >= 1
  }, [superpixelWidth, superpixelHeight, colorMode, numColors, pixelCountWidth, pixelCountHeight])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || busy) return
    onApply({
      superpixel_width: superpixelWidth,
      superpixel_height: superpixelHeight,
      color_mode: colorMode,
      num_colors: numColors,
    })
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
          label={pixelateFilter.ui.superpixel_width.label}
          id="superpixel-width"
          value={String(superpixelWidth)}
          onCommit={setIntFromDraft(setSuperpixelWidth)}
          onDraftChange={setIntFromDraft(setSuperpixelWidth)}
          disabled={busy}
        />

        <FormField
          variant="numeric"
          numericMode="int"
          label={pixelateFilter.ui.superpixel_height.label}
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
          label={pixelateFilter.ui.color_mode.label}
          id="color-mode"
          value={colorMode}
          options={pixelateFilter.ui.color_mode.options}
          onCommit={(v) => setColorMode(v as "rgb" | "grayscale")}
          disabled={busy}
        />

        <FormField
          variant="numeric"
          numericMode="int"
          label={pixelateFilter.ui.num_colors.label}
          id="num-colors"
          value={String(numColors)}
          onCommit={setIntFromDraft(setNumColors)}
          onDraftChange={setIntFromDraft(setNumColors)}
          disabled={busy}
          inputProps={{ min: pixelateFilter.ui.num_colors.min, max: pixelateFilter.ui.num_colors.max }}
        />
      </div>

      <FilterFormFooter onCancel={onCancel} isValid={isValid} busy={busy} />
    </form>
  )
}
