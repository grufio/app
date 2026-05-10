"use client"

import { lineartFilter } from "@/lib/editor/filters/lineart"

import { BaseFilterController } from "./BaseFilterController"
import { LineArtForm, type LineArtFormData } from "./lineart-form"

type Props = {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  onError?: (error: Error) => void
  onApplyFilter: (args: { filterType: "lineart"; filterParams: Record<string, unknown> }) => Promise<void>
}

export function LineArtFilterController({
  open,
  onClose,
  onSuccess,
  onError,
  onApplyFilter,
}: Props) {
  return (
    <BaseFilterController<LineArtFormData>
      open={open}
      onClose={onClose}
      onSuccess={onSuccess}
      onError={onError}
      title={lineartFilter.meta.title}
      description={lineartFilter.meta.description}
      applyFilter={async (data) => {
        await onApplyFilter({
          filterType: "lineart",
          filterParams: data,
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
