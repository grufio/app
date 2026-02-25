"use client"

import { BaseFilterController } from "./BaseFilterController"
import { PixelateForm, type PixelateFormData } from "./pixelate-form"
import { applyPixelateFilter } from "@/lib/api/project-images"

type Props = {
  projectId: string
  workingImageId: string
  workingImageWidth: number
  workingImageHeight: number
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function PixelateFilterController({
  projectId,
  workingImageId,
  workingImageWidth,
  workingImageHeight,
  open,
  onClose,
  onSuccess,
}: Props) {
  return (
    <BaseFilterController<PixelateFormData>
      open={open}
      onClose={onClose}
      onSuccess={onSuccess}
      title="Pixelate"
      description="Configure pixelate filter settings."
      applyFilter={(data) =>
        applyPixelateFilter({
          projectId,
          sourceImageId: workingImageId,
          superpixelWidth: data.superpixelWidth,
          superpixelHeight: data.superpixelHeight,
          colorMode: data.colorMode,
          numColors: data.numColors,
        })
      }
    >
      {({ busy, onCancel, onApply }) => (
        <PixelateForm
          imageWidth={workingImageWidth}
          imageHeight={workingImageHeight}
          onCancel={onCancel}
          onApply={onApply}
          busy={busy}
        />
      )}
    </BaseFilterController>
  )
}
