import { cn } from "@/lib/utils"

import { STEPS, type StepId } from "./step-validation"

export function StepIndicator(props: {
  activeStep: StepId
  stepValidity: Record<StepId, boolean>
  onStepClick: (id: StepId) => void
}) {
  const { activeStep, stepValidity, onStepClick } = props
  return (
    <div className="flex w-full items-center py-2">
      {STEPS.map((step, idx) => {
        const isActive = step.id === activeStep
        const isValid = stepValidity[step.id]
        const clickable = isValid || isActive
        return (
          <div
            key={step.id}
            className={cn("flex items-center", idx < STEPS.length - 1 ? "flex-1" : "shrink-0")}
          >
            <button
              type="button"
              disabled={!clickable}
              onClick={() => onStepClick(step.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 text-xs font-medium transition-colors",
                clickable
                  ? "cursor-pointer hover:text-foreground"
                  : "cursor-not-allowed text-muted-foreground/60",
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
            {idx < STEPS.length - 1 ? <div className="mx-3 h-px flex-1 bg-border" /> : null}
          </div>
        )
      })}
    </div>
  )
}
