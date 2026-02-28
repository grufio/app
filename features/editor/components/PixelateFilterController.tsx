"use client"

import { BaseFilterController } from "./BaseFilterController"
import { PixelateForm, type PixelateFormData } from "./pixelate-form"
import { applyProjectImageFilter } from "@/lib/api/project-images"

type Props = {
  projectId: string
  workingImageId: string
  workingImageWidth: number
  workingImageHeight: number
  open: boolean
  onClose: () => void
  onSuccess: () => void
  onError?: (error: Error) => void
}

export function PixelateFilterController({
  projectId,
  workingImageId,
  workingImageWidth,
  workingImageHeight,
  open,
  onClose,
  onSuccess,
  onError,
}: Props) {
  return (
    <BaseFilterController<PixelateFormData>
      open={open}
      onClose={onClose}
      onSuccess={onSuccess}
      onError={onError}
      title="Pixelate"
      description="Configure pixelate filter settings."
      applyFilter={async (data) => {
        await applyProjectImageFilter({
          projectId,
          filterType: "pixelate",
          filterParams: {
            source_image_id: workingImageId,
            superpixel_width: data.superpixelWidth,
            superpixel_height: data.superpixelHeight,
            color_mode: data.colorMode,
            num_colors: data.numColors,
          },
        })
      }}
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
