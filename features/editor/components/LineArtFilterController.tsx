"use client"

import { BaseFilterController } from "./BaseFilterController"
import { LineArtForm, type LineArtFormData } from "./lineart-form"
import { applyLineArtFilter } from "@/lib/api/project-images"

type Props = {
  projectId: string
  workingImageId: string
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function LineArtFilterController({
  projectId,
  workingImageId,
  open,
  onClose,
  onSuccess,
}: Props) {
  return (
    <BaseFilterController<LineArtFormData>
      open={open}
      onClose={onClose}
      onSuccess={onSuccess}
      title="Line Art"
      description="Create comic-style outlines with edge detection."
      applyFilter={(data) =>
        applyLineArtFilter({
          projectId,
          sourceImageId: workingImageId,
          threshold1: data.threshold1,
          threshold2: data.threshold2,
          lineThickness: data.lineThickness,
          blurAmount: data.blurAmount,
          minContourArea: data.minContourArea,
          invert: data.invert,
          smoothness: data.smoothness,
        })
      }
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
