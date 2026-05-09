"use client"

import { numerateFilter } from "@/lib/editor/filters/numerate"

import { BaseFilterController } from "./BaseFilterController"
import { NumerateForm, type NumerateFormData } from "./numerate-form"

type Props = {
  superpixelWidth: number
  superpixelHeight: number
  open: boolean
  onClose: () => void
  onSuccess: () => void
  onError?: (error: Error) => void
  onApplyFilter: (args: { filterType: "numerate"; filterParams: Record<string, unknown> }) => Promise<void>
}

export function NumerateFilterController({
  superpixelWidth,
  superpixelHeight,
  open,
  onClose,
  onSuccess,
  onError,
  onApplyFilter,
}: Props) {
  return (
    <BaseFilterController<NumerateFormData>
      open={open}
      onClose={onClose}
      onSuccess={onSuccess}
      onError={onError}
      title={numerateFilter.meta.title}
      description={numerateFilter.meta.description}
      applyFilter={async (data) => {
        await onApplyFilter({
          filterType: "numerate",
          filterParams: {
            superpixel_width: superpixelWidth,
            superpixel_height: superpixelHeight,
            ...data,
          },
        })
      }}
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
