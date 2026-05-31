"use client"

import { Lock } from "lucide-react"

import { AppButton } from "@/components/ui/form-controls"
import { cn } from "@/lib/utils"

/**
 * Banner shown inside a locked section (Image / Filter). The lock is
 * derived from downstream-data presence — see
 * `lib/editor/section-locks.ts`. The banner explains *why* the section
 * is locked and offers an Unlock button that cascade-deletes the
 * downstream artefact(s).
 *
 * Untoggleable lock state still renders the banner (so the user knows
 * what's blocking them) but greys out the button — the only path
 * forward is editing the deeper section that owns the artefact.
 */
export function SectionLockBanner({
  message,
  toggleable,
  busy,
  onUnlock,
  className,
}: {
  message: string
  toggleable: boolean
  busy?: boolean
  onUnlock?: () => void
  className?: string
}) {
  return (
    <div
      role="status"
      className={cn(
        "mb-3 flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900",
        className,
      )}
    >
      <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1 leading-snug">{message}</div>
      <AppButton
        type="button"
        size="sm"
        variant="outline"
        disabled={!toggleable || busy}
        onClick={onUnlock}
      >
        {busy ? "Unlocking…" : "Unlock"}
      </AppButton>
    </div>
  )
}
