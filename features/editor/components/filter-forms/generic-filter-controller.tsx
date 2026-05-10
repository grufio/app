"use client"

/**
 * Schema-driven filter controller (F8).
 *
 * Replaces the three per-filter `*FilterController.tsx` adapters by
 * looking up the filter definition by id and rendering a
 * `BaseFilterController` wrapping a `GenericFilterForm`. Title /
 * description come from `filterDef.meta`; the helper render hook and
 * pre-submit transform live on the registry definition.
 */
import type { z } from "zod"

import { FILTER_REGISTRY, type RegisteredFilterId } from "@/lib/editor/filters/registry"
import type { FilterDefinition, FilterRenderContext } from "@/lib/editor/filters/types"

import { BaseFilterController } from "../BaseFilterController"
import { GenericFilterForm } from "./generic-filter-form"

type GenericFilterControllerProps = {
  filterId: RegisteredFilterId
  ctx: FilterRenderContext
  open: boolean
  onClose: () => void
  onSuccess: () => void
  onError?: (error: Error) => void
  onApplyFilter: (args: { filterType: RegisteredFilterId; filterParams: Record<string, unknown> }) => Promise<void>
}

export function GenericFilterController({
  filterId,
  ctx,
  open,
  onClose,
  onSuccess,
  onError,
  onApplyFilter,
}: GenericFilterControllerProps) {
  // Each registry entry has a different schema type, so the lookup
  // returns a heterogeneous union. The GenericFilterForm only uses
  // the schema's `parse` / `safeParse` (both on the base type), so we
  // erase the per-filter schema generic here.
  const filterDef = FILTER_REGISTRY[filterId] as FilterDefinition<z.ZodType>
  const title = filterDef.meta?.title ?? filterDef.label
  const description = filterDef.meta?.description ?? ""
  // Lineart's apply step shows "Processing..." while the others say
  // "Apply"; preserved here so the visible behaviour doesn't drift.
  const applyingLabel = filterId === "lineart" ? "Processing..." : undefined

  return (
    <BaseFilterController<Record<string, unknown>>
      open={open}
      onClose={onClose}
      onSuccess={onSuccess}
      onError={onError}
      title={title}
      description={description}
      applyFilter={async (data) => {
        await onApplyFilter({ filterType: filterId, filterParams: data })
      }}
    >
      {({ busy, onCancel, onApply }) => (
        <GenericFilterForm
          filterDef={filterDef}
          ctx={ctx}
          busy={busy}
          applyingLabel={applyingLabel}
          onCancel={onCancel}
          onApply={(params) => {
            void onApply(params as Record<string, unknown>)
          }}
        />
      )}
    </BaseFilterController>
  )
}
