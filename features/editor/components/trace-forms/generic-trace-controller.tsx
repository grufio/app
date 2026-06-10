"use client"

/**
 * Schema-driven trace controller (F21 PR2).
 *
 * Sister to `GenericFilterController` — picks the trace definition
 * from `TRACE_REGISTRY`, renders `BaseFilterController` wrapping a
 * `GenericFilterForm` parametrised over `TraceRenderContext`. The
 * registry's `helperState` and `transformBeforeSubmit` hooks fire
 * with the trace context (image dims + inherited Pixelate
 * superpixel grid).
 */
import type { z } from "zod"
import { Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { TRACE_REGISTRY, type RegisteredTraceId } from "@/lib/editor/trace/registry"
import type { TraceRenderContext } from "@/lib/editor/trace/types"
import type { FilterDefinition } from "@/lib/editor/filters/types"

import { BaseFilterController } from "../BaseFilterController"
import { GenericFilterForm } from "../filter-forms/generic-filter-form"

type GenericTraceControllerProps = {
  kind: RegisteredTraceId
  ctx: TraceRenderContext
  open: boolean
  onClose: () => void
  onSuccess: () => void
  onError?: (error: Error) => void
  onApplyTrace: (args: {
    kind: RegisteredTraceId
    params: Record<string, unknown>
  }) => Promise<void>
  /** Present only when editing the active trace — renders a Delete
   * action in the dialog header. */
  onDeleteTrace?: () => void
}

export function GenericTraceController({
  kind,
  ctx,
  open,
  onClose,
  onSuccess,
  onError,
  onApplyTrace,
  onDeleteTrace,
}: GenericTraceControllerProps) {
  // Each registry entry has a different schema type, so the lookup
  // returns a heterogeneous union. Erase the per-trace schema generic
  // — GenericFilterForm only uses parse/safeParse on the base type.
  const traceDef = TRACE_REGISTRY[kind] as FilterDefinition<z.ZodType, TraceRenderContext>
  const title = traceDef.meta?.title ?? traceDef.label
  const description = traceDef.meta?.description ?? ""
  // Lineart's apply step shows "Processing..." while pixelate uses
  // the default "Apply"; preserve from the legacy per-filter
  // controller.
  const applyingLabel = kind === "lineart" ? "Processing..." : undefined

  return (
    <BaseFilterController<Record<string, unknown>>
      open={open}
      onClose={onClose}
      onSuccess={onSuccess}
      onError={onError}
      title={title}
      description={description}
      headerAction={
        onDeleteTrace ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDeleteTrace}
            aria-label="Delete trace"
          >
            <Trash2 className="size-4" />
          </Button>
        ) : undefined
      }
      applyFilter={async (data) => {
        await onApplyTrace({ kind, params: data })
      }}
    >
      {({ busy, onCancel, onApply }) => (
        <GenericFilterForm<z.ZodType, TraceRenderContext>
          filterDef={traceDef}
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
