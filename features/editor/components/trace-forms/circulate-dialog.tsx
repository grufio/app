"use client"

/**
 * Circulate trace dialog — thin wrapper around `CellTraceDialog`
 * that plugs in the circulate schema, grid math, 3-segment form,
 * and preview pane. All draft / busy / apply lifecycle lives in
 * the shared shell.
 */
import { circulateSchema, type CirculateParams } from "@/lib/editor/trace/circulate"
import {
  isCirculateGridValid,
  resolveCirculateGrid,
  type CirculateGrid,
} from "@/lib/editor/trace/circulate-grid-math"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"
import type { TraceContentRegion } from "@/lib/editor/trace/content-region"

import { CellTraceDialog } from "./cell-trace-dialog"
import { CirculateForm } from "./circulate-form"
import { CirculatePreviewPane } from "./circulate-preview-pane"

type Props = {
  open: boolean
  sourceImageUrl: string
  displayMmW: number
  displayMmH: number
  contentRegion?: TraceContentRegion | null
  onClose: () => void
  onSuccess: () => void
  onApplyTrace: (args: {
    kind: RegisteredTraceId
    params: Record<string, unknown>
  }) => Promise<void>
  onDeleteTrace?: () => void | Promise<void>
  initialParams?: Record<string, unknown>
}

export function CirculateDialog(props: Props) {
  return (
    <CellTraceDialog<CirculateParams, CirculateGrid>
      {...props}
      title="Circulate"
      traceKind="circulate"
      schema={circulateSchema}
      resolveGrid={resolveCirculateGrid}
      isGridValid={isCirculateGridValid}
      Form={CirculateForm}
      Preview={CirculatePreviewPane}
    />
  )
}
