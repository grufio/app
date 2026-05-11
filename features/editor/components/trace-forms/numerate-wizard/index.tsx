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
 *
 * Layout: this `index.tsx` is the orchestrator. Steps + indicator +
 * footer live in sibling files. Pure validation lives in
 * `step-validation.ts`.
 */
import { useMemo, useState } from "react"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { normalizeApiError } from "@/lib/api/error-normalizer"
import { useProjectWorkspace } from "@/lib/editor/project-workspace"
import { numerateSchema, type NumerateParams } from "@/lib/editor/trace/numerate"
import { gridFromSuperpixel, type GridStats } from "@/lib/editor/trace/numerate-grid-math"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"

import { ColorsStep } from "./colors-step"
import { GridStep, type GridMode } from "./grid-step"
import { OutputStep } from "./output-step"
import { StepIndicator } from "./step-indicator"
import {
  STEPS,
  canJumpTo,
  isFullyValid,
  stepValidity,
  type StepId,
} from "./step-validation"
import { WizardFooter } from "./wizard-footer"

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

  const validity = stepValidity(draft, { widthPx: workspace.widthPx, heightPx: workspace.heightPx })
  const fullValid = isFullyValid(validity)

  const onStepClick = (id: StepId) => {
    if (busy) return
    if (canJumpTo(id, activeStep, validity)) setActiveStep(id)
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

        <StepIndicator activeStep={activeStep} stepValidity={validity} onStepClick={onStepClick} />

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
          activeStepValid={validity[activeStep]}
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
