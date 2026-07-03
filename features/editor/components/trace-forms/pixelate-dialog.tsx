"use client"

/**
 * Pixelate trace dialog — thin wrapper around `CellTraceDialog`
 * that plugs in the pixelate schema, grid math, form, and preview
 * pane. All draft / busy / apply lifecycle lives in the shared
 * shell.
 */
import { pixelateSchema, type PixelateParams } from "@/lib/editor/trace/pixelate"
import {
  isPixelateGridValid,
  resolvePixelateGrid,
  type PixelateGrid,
} from "@/lib/editor/trace/pixelate-grid-math"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"
import type { TraceContentRegion } from "@/lib/editor/trace/content-region"

import { CellTraceDialog } from "./cell-trace-dialog"
import { PixelateForm } from "./pixelate-form"
import { PixelatePreviewPane } from "./pixelate-preview-pane"

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

export function PixelateDialog(props: Props) {
  return (
    <CellTraceDialog<PixelateParams, PixelateGrid>
      {...props}
      title="Pixelate"
      traceKind="pixelate"
      schema={pixelateSchema}
      resolveGrid={resolvePixelateGrid}
      isGridValid={isPixelateGridValid}
      Form={PixelateForm}
      Preview={PixelatePreviewPane}
    />
  )
}
