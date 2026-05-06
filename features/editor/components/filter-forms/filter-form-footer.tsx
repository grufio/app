"use client"

import { AppButton } from "@/components/ui/form-controls"

/**
 * Cancel/Apply footer shared by all filter dialogs (pixelate, lineart,
 * numerate). Centralises the busy-state copy ("Applying…") and the
 * disabled-when-invalid wiring so that future filter forms get the
 * exact same UX without a copy/paste.
 */
type Props = {
  onCancel: () => void
  isValid: boolean
  busy?: boolean
  applyLabel?: string
  applyingLabel?: string
}

export function FilterFormFooter({
  onCancel,
  isValid,
  busy = false,
  applyLabel = "Apply",
  applyingLabel = "Applying...",
}: Props) {
  return (
    <div className="flex gap-2 justify-end">
      <AppButton type="button" variant="outline" onClick={onCancel} disabled={busy}>
        Cancel
      </AppButton>
      <AppButton type="submit" disabled={!isValid || busy}>
        {busy ? applyingLabel : applyLabel}
      </AppButton>
    </div>
  )
}
