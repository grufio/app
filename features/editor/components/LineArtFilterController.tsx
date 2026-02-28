"use client"

import { BaseFilterController } from "./BaseFilterController"
import { LineArtForm, type LineArtFormData } from "./lineart-form"
import { applyProjectImageFilter } from "@/lib/api/project-images"

type Props = {
  projectId: string
  workingImageId: string
  open: boolean
  onClose: () => void
  onSuccess: () => void
  onError?: (error: Error) => void
}

export function LineArtFilterController({
  projectId,
  workingImageId,
  open,
  onClose,
  onSuccess,
  onError,
}: Props) {
  return (
    <BaseFilterController<LineArtFormData>
      open={open}
      onClose={onClose}
      onSuccess={onSuccess}
      onError={onError}
      title="Line Art"
      description="Create comic-style outlines with edge detection."
      applyFilter={async (data) => {
        await applyProjectImageFilter({
          projectId,
          filterType: "lineart",
          filterParams: {
            source_image_id: workingImageId,
            threshold1: data.threshold1,
            threshold2: data.threshold2,
            line_thickness: data.lineThickness,
            blur_amount: data.blurAmount,
            min_contour_area: data.minContourArea,
            invert: data.invert,
            smoothness: data.smoothness,
          },
        })
      }}
    >
      {({ busy, onCancel, onApply }) => (
        <LineArtForm
          onCancel={onCancel}
          onApply={onApply}
          busy={busy}
        />
      )}
    </BaseFilterController>
  )
}
