"use client"

/**
 * Numerate trace wizard. Three-step dialog that replaces the single
 * generic form for numerate only (lineart still uses the generic
 * single-form controller).
 *
 * Step 1 — Grid: user picks cell count (primary) or superpixel size
 * (fallback). The other value derives via floor-division; leftover
 * pixels (when the image isn't an exact multiple) surface as an
 * inline warning. The Python service crops leftover regions.
 *
 * Step 2 — Colors: num_colors, show_colors, stroke_width. Stroke
 * width supports fractional values down to 0.1 (PR #66).
 *
 * Step 3 — Output: read-only display of the project's artboard
 * dimensions from `useProjectWorkspace`. If no artboard exists yet,
 * Apply is disabled with a hint to set one in the Artboard panel.
 *
 * Step navigation: indicator buttons are clickable once the target
 * step is valid. Forward jumps require all preceding steps valid.
 * Backward jumps are always allowed.
 */
import { useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"

import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { AppButton, FormField } from "@/components/ui/form-controls"
import { cn } from "@/lib/utils"
import { normalizeApiError } from "@/lib/api/error-normalizer"
import { useProjectWorkspace } from "@/lib/editor/project-workspace"
import { numerateSchema, type NumerateParams } from "@/lib/editor/trace/numerate"
import { gridFromCells, gridFromSuperpixel, type GridStats } from "@/lib/editor/trace/numerate-grid-math"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"

type StepId = "grid" | "colors" | "output"
type GridMode = "cells" | "superpixel"

const STEPS: ReadonlyArray<{ id: StepId; label: string }> = [
  { id: "grid", label: "Grid" },
  { id: "colors", label: "Colors" },
  { id: "output", label: "Output" },
]

type WizardProps = {
  open: boolean
  imageWidth: number
  imageHeight: number
  onClose: () => void
  onSuccess: () => void
  onError?: (error: Error) => void
  onApplyTrace: (args: { kind: RegisteredTraceId; params: Record<string, unknown> }) => Promise<void>
}

export function NumerateWizard({
  open,
  imageWidth,
  imageHeight,
  onClose,
  onSuccess,
  onError,
  onApplyTrace,
}: WizardProps) {
  const workspace = useProjectWorkspace()
  const defaults = useMemo(() => numerateSchema.parse({}) as NumerateParams, [])
  const [draft, setDraft] = useState<NumerateParams>(defaults)
  const [gridMode, setGridMode] = useState<GridMode>("cells")
  const [activeStep, setActiveStep] = useState<StepId>("grid")
  const [busy, setBusy] = useState(false)

  const setField = <K extends keyof NumerateParams>(key: K, value: NumerateParams[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  const grid = useMemo<GridStats>(
    () => gridFromSuperpixel(imageWidth, imageHeight, draft.superpixel_width, draft.superpixel_height),
    [imageWidth, imageHeight, draft.superpixel_width, draft.superpixel_height],
  )

  const stepValidity: Record<StepId, boolean> = {
    grid: draft.superpixel_width >= 1 && draft.superpixel_height >= 1,
    colors:
      draft.stroke_width >= 0.1 &&
      draft.stroke_width <= 20 &&
      draft.num_colors >= 2 &&
      draft.num_colors <= 256,
    output: workspace.widthPx != null && workspace.heightPx != null,
  }
  const fullValid = stepValidity.grid && stepValidity.colors && stepValidity.output

  const canJumpTo = (target: StepId): boolean => {
    if (target === activeStep) return true
    const targetIdx = STEPS.findIndex((s) => s.id === target)
    const activeIdx = STEPS.findIndex((s) => s.id === activeStep)
    if (targetIdx < activeIdx) return true
    return STEPS.slice(0, targetIdx).every((s) => stepValidity[s.id])
  }

  const onStepClick = (id: StepId) => {
    if (busy) return
    if (canJumpTo(id)) setActiveStep(id)
  }

  const onNext = () => {
    const idx = STEPS.findIndex((s) => s.id === activeStep)
    if (idx < STEPS.length - 1) setActiveStep(STEPS[idx + 1].id)
  }

  const onBack = () => {
    const idx = STEPS.findIndex((s) => s.id === activeStep)
    if (idx > 0) setActiveStep(STEPS[idx - 1].id)
  }

  const handleCancel = () => {
    if (busy) return
    onClose()
  }

  const handleApply = async () => {
    if (busy || !fullValid) return
    setBusy(true)
    try {
      await onApplyTrace({ kind: "numerate", params: draft as Record<string, unknown> })
      onSuccess()
      onClose()
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e))
      console.error("Failed to apply trace:", error)
      if (onError) {
        onError(error)
      } else {
        const normalized = normalizeApiError(error)
        toast.error(normalized.title, normalized.detail ? { description: normalized.detail } : undefined)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Numerate</DialogTitle>
          <DialogDescription>
            Create a vector grid overlay from pixelated superpixels.
          </DialogDescription>
        </DialogHeader>

        <StepIndicator activeStep={activeStep} stepValidity={stepValidity} onStepClick={onStepClick} />

        <div className="min-h-[220px]">
          {activeStep === "grid" ? (
            <GridStep
              imageWidth={imageWidth}
              imageHeight={imageHeight}
              gridMode={gridMode}
              onGridModeChange={setGridMode}
              draft={draft}
              setField={setField}
              grid={grid}
              busy={busy}
            />
          ) : null}
          {activeStep === "colors" ? (
            <ColorsStep draft={draft} setField={setField} busy={busy} />
          ) : null}
          {activeStep === "output" ? (
            <OutputStep
              imageWidth={imageWidth}
              imageHeight={imageHeight}
              workspaceWidthPx={workspace.widthPx}
              workspaceHeightPx={workspace.heightPx}
            />
          ) : null}
        </div>

        <WizardFooter
          activeStep={activeStep}
          activeStepValid={stepValidity[activeStep]}
          fullValid={fullValid}
          busy={busy}
          onCancel={handleCancel}
          onBack={onBack}
          onNext={onNext}
          onApply={() => void handleApply()}
        />
      </DialogContent>
    </Dialog>
  )
}

function StepIndicator(props: {
  activeStep: StepId
  stepValidity: Record<StepId, boolean>
  onStepClick: (id: StepId) => void
}) {
  const { activeStep, stepValidity, onStepClick } = props
  return (
    <div className="flex items-center gap-2 py-2">
      {STEPS.map((step, idx) => {
        const isActive = step.id === activeStep
        const isValid = stepValidity[step.id]
        const clickable = isValid || isActive
        return (
          <div key={step.id} className="flex items-center gap-2">
            <button
              type="button"
              disabled={!clickable}
              onClick={() => onStepClick(step.id)}
              className={cn(
                "flex items-center gap-2 text-xs font-medium transition-colors",
                clickable ? "cursor-pointer hover:text-foreground" : "cursor-not-allowed text-muted-foreground/60",
                isActive ? "text-foreground" : "text-muted-foreground",
              )}
              aria-current={isActive ? "step" : undefined}
            >
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full border text-[11px]",
                  isActive
                    ? "border-foreground bg-foreground text-background"
                    : isValid
                      ? "border-foreground bg-background text-foreground"
                      : "border-muted-foreground/40 bg-background text-muted-foreground/60",
                )}
              >
                {idx + 1}
              </span>
              <span>{step.label}</span>
            </button>
            {idx < STEPS.length - 1 ? <div className="h-px w-6 bg-border" /> : null}
          </div>
        )
      })}
    </div>
  )
}

function GridStep(props: {
  imageWidth: number
  imageHeight: number
  gridMode: GridMode
  onGridModeChange: (mode: GridMode) => void
  draft: NumerateParams
  setField: <K extends keyof NumerateParams>(key: K, value: NumerateParams[K]) => void
  grid: GridStats
  busy: boolean
}) {
  const { imageWidth, imageHeight, gridMode, onGridModeChange, draft, setField, grid, busy } = props

  const onCellsXCommit = (raw: string) => {
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 1) return
    const next = gridFromCells(imageWidth, imageHeight, n, grid.cellsY)
    setField("superpixel_width", next.superpixelWidth)
  }
  const onCellsYCommit = (raw: string) => {
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 1) return
    const next = gridFromCells(imageWidth, imageHeight, grid.cellsX, n)
    setField("superpixel_height", next.superpixelHeight)
  }
  const onSuperWCommit = (raw: string) => {
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 1) return
    setField("superpixel_width", Math.floor(n))
  }
  const onSuperHCommit = (raw: string) => {
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 1) return
    setField("superpixel_height", Math.floor(n))
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="text-xs text-muted-foreground">
        Image: {imageWidth} × {imageHeight} px
      </div>

      <div className="flex items-center gap-2 text-xs">
        <ModeTab active={gridMode === "cells"} onClick={() => onGridModeChange("cells")}>
          Number of cells
        </ModeTab>
        <ModeTab active={gridMode === "superpixel"} onClick={() => onGridModeChange("superpixel")}>
          Superpixel size
        </ModeTab>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {gridMode === "cells" ? (
          <>
            <FormField
              variant="numeric"
              numericMode="int"
              label="Cells horizontal"
              id="cells_x"
              value={String(grid.cellsX)}
              onCommit={onCellsXCommit}
              onDraftChange={onCellsXCommit}
              disabled={busy}
              inputProps={{ min: 1, max: imageWidth }}
            />
            <FormField
              variant="numeric"
              numericMode="int"
              label="Cells vertical"
              id="cells_y"
              value={String(grid.cellsY)}
              onCommit={onCellsYCommit}
              onDraftChange={onCellsYCommit}
              disabled={busy}
              inputProps={{ min: 1, max: imageHeight }}
            />
          </>
        ) : (
          <>
            <FormField
              variant="numeric"
              numericMode="int"
              label="Superpixel Width (px)"
              id="superpixel_width"
              value={String(draft.superpixel_width)}
              onCommit={onSuperWCommit}
              onDraftChange={onSuperWCommit}
              disabled={busy}
              inputProps={{ min: 1, max: imageWidth }}
            />
            <FormField
              variant="numeric"
              numericMode="int"
              label="Superpixel Height (px)"
              id="superpixel_height"
              value={String(draft.superpixel_height)}
              onCommit={onSuperHCommit}
              onDraftChange={onSuperHCommit}
              disabled={busy}
              inputProps={{ min: 1, max: imageHeight }}
            />
          </>
        )}
      </div>

      <GridSummary grid={grid} imageWidth={imageWidth} imageHeight={imageHeight} mode={gridMode} />
    </div>
  )
}

function ModeTab(props: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cn(
        "rounded-md border px-2 py-1 text-xs transition-colors",
        props.active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {props.children}
    </button>
  )
}

function GridSummary(props: { grid: GridStats; imageWidth: number; imageHeight: number; mode: GridMode }) {
  const { grid, imageWidth, imageHeight, mode } = props
  const derivedLabel =
    mode === "cells"
      ? `Superpixel: ${grid.superpixelWidth} × ${grid.superpixelHeight} px`
      : `Cells: ${grid.cellsX} × ${grid.cellsY}`
  return (
    <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
      <div>{derivedLabel}</div>
      <div>Total cells: {grid.totalCells}</div>
      <div>
        Coverage: {grid.coveredWidth} × {grid.coveredHeight} px
      </div>
      {grid.isExact ? null : (
        <div className="mt-1 text-amber-600 dark:text-amber-400">
          ⚠ {imageWidth - grid.coveredWidth} px right and {imageHeight - grid.coveredHeight} px bottom are cropped.
        </div>
      )}
    </div>
  )
}

function ColorsStep(props: {
  draft: NumerateParams
  setField: <K extends keyof NumerateParams>(key: K, value: NumerateParams[K]) => void
  busy: boolean
}) {
  const { draft, setField, busy } = props
  return (
    <div className="flex flex-col gap-5">
      <FormField
        variant="numeric"
        numericMode="int"
        label="Number of Colors"
        id="num_colors"
        value={String(draft.num_colors)}
        onCommit={(raw) => {
          const n = Number(raw)
          if (Number.isFinite(n)) setField("num_colors", n)
        }}
        onDraftChange={(raw) => {
          const n = Number(raw)
          if (Number.isFinite(n)) setField("num_colors", n)
        }}
        disabled={busy}
        inputProps={{ min: 2, max: 256 }}
        description="Palette size (2-256). Fewer colors merge more cells into the same region."
      />
      <FormField
        variant="numeric"
        numericMode="decimal"
        label="Vector Line Width (px)"
        id="stroke_width"
        value={String(draft.stroke_width)}
        onCommit={(raw) => {
          const n = Number(raw)
          if (Number.isFinite(n)) setField("stroke_width", n)
        }}
        onDraftChange={(raw) => {
          const n = Number(raw)
          if (Number.isFinite(n)) setField("stroke_width", n)
        }}
        disabled={busy}
        inputProps={{ min: 0.1, max: 20, step: 0.1 }}
      />
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Checkbox
            id="show_colors"
            checked={draft.show_colors === true}
            onCheckedChange={(c) => setField("show_colors", c === true)}
            disabled={busy}
          />
          <Label htmlFor="show_colors" className="cursor-pointer font-normal">
            Show Colors
          </Label>
        </div>
      </div>
    </div>
  )
}

function OutputStep(props: {
  imageWidth: number
  imageHeight: number
  workspaceWidthPx: number | null
  workspaceHeightPx: number | null
}) {
  const { imageWidth, imageHeight, workspaceWidthPx, workspaceHeightPx } = props
  if (workspaceWidthPx == null || workspaceHeightPx == null) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
        Artboard size is not set yet. Open the Artboard panel and configure
        width × height before applying the trace.
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <div className="rounded-md border bg-muted/40 px-3 py-3 text-xs">
        <div>
          Artboard: <span className="font-medium text-foreground">{workspaceWidthPx} × {workspaceHeightPx} px</span>
        </div>
        <div className="mt-1">
          Image: {imageWidth} × {imageHeight} px
        </div>
        <div className="mt-2 text-muted-foreground">
          The trace is placed onto the artboard at the current image position.
          Change the artboard dimensions in the right-panel “Artboard” section.
        </div>
      </div>
    </div>
  )
}

function WizardFooter(props: {
  activeStep: StepId
  activeStepValid: boolean
  fullValid: boolean
  busy: boolean
  onCancel: () => void
  onBack: () => void
  onNext: () => void
  onApply: () => void
}) {
  const { activeStep, activeStepValid, fullValid, busy, onCancel, onBack, onNext, onApply } = props
  const idx = STEPS.findIndex((s) => s.id === activeStep)
  const isFirst = idx === 0
  const isLast = idx === STEPS.length - 1

  return (
    <div className="flex justify-between gap-2 pt-2">
      <AppButton type="button" variant="outline" onClick={onCancel} disabled={busy}>
        Cancel
      </AppButton>
      <div className="flex gap-2">
        {isFirst ? null : (
          <AppButton type="button" variant="outline" onClick={onBack} disabled={busy}>
            Back
          </AppButton>
        )}
        {isLast ? (
          <AppButton type="button" onClick={onApply} disabled={!fullValid || busy}>
            {busy ? "Applying..." : "Apply"}
          </AppButton>
        ) : (
          <AppButton type="button" onClick={onNext} disabled={!activeStepValid || busy}>
            Next
          </AppButton>
        )}
      </div>
    </div>
  )
}
