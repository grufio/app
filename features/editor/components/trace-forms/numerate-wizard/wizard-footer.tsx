import { AppButton } from "@/components/ui/form-controls"

import { STEPS, type StepId } from "./step-validation"

export function WizardFooter(props: {
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
