"use client"

import { BaseFilterController } from "./BaseFilterController"
import { PixelateForm, type PixelateFormData } from "./pixelate-form"

type Props = {
  workingImageWidth: number
  workingImageHeight: number
  open: boolean
  onClose: () => void
  onSuccess: () => void
  onError?: (error: Error) => void
  onApplyFilter: (args: { filterType: "pixelate"; filterParams: Record<string, unknown> }) => Promise<void>
}

export function PixelateFilterController({
  workingImageWidth,
  workingImageHeight,
  open,
  onClose,
  onSuccess,
  onError,
  onApplyFilter,
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
        await onApplyFilter({
          filterType: "pixelate",
          filterParams: {
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
