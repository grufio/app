"use client"

import { BaseFilterController } from "./BaseFilterController"
import { NumerateForm, type NumerateFormData } from "./numerate-form"
import { applyNumerateFilter } from "@/lib/api/project-images"

type Props = {
  projectId: string
  workingImageId: string
  superpixelWidth: number
  superpixelHeight: number
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function NumerateFilterController({
  projectId,
  workingImageId,
  superpixelWidth,
  superpixelHeight,
  open,
  onClose,
  onSuccess,
}: Props) {
  return (
    <BaseFilterController<NumerateFormData>
      open={open}
      onClose={onClose}
      onSuccess={onSuccess}
      title="Numerate"
      description="Create a vector grid overlay from pixelated superpixels."
      applyFilter={(data) =>
        applyNumerateFilter({
          projectId,
          sourceImageId: workingImageId,
          superpixelWidth,
          superpixelHeight,
          strokeWidth: data.strokeWidth,
          showColors: data.showColors,
        })
      }
    >
      {({ busy, onCancel, onApply }) => (
        <NumerateForm
          superpixelWidth={superpixelWidth}
          superpixelHeight={superpixelHeight}
          onCancel={onCancel}
          onApply={onApply}
          busy={busy}
        />
      )}
    </BaseFilterController>
  )
}
