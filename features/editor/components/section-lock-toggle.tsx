"use client"

/**
 * Section-header icon button signalling that the surrounding editor
 * section is locked. Replaces the in-body `SectionLockBanner`.
 *
 * The lock state itself is computed upstream by
 * `deriveSectionLocks` (`lib/editor/section-locks.ts`) — same
 * `{ message, toggleable, busy?, onUnlock? }` shape the banner used.
 *
 * Rendering rules mirror the old banner so no diagnosis affordance
 * is lost when migrating:
 *
 * - `lock === null` → renders `null`, no button.
 * - `lock != null && !toggleable` → button visible but disabled, so
 *   the user can hover (desktop) or read the aria-label (assistive
 *   tech) to learn why the section is locked. The only path forward
 *   is editing the deeper section that owns the downstream artefact.
 * - `lock != null && toggleable` → enabled; click calls `onUnlock`
 *   which routes through the shell's confirmation `Dialog` where
 *   the full prose + Confirm/Cancel live.
 * - `busy` → disabled with the same visual treatment, prevents
 *   double-submit while the unlock is in flight.
 */
import { Lock } from "lucide-react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import { RightPanelIconButton } from "./right-panel-controls"

export function SectionLockToggle({
  lock,
}: {
  lock: {
    message: string
    toggleable: boolean
    busy?: boolean
    onUnlock?: () => void
  } | null
}) {
  if (!lock) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <RightPanelIconButton
          type="button"
          aria-label={lock.message}
          disabled={!lock.toggleable || lock.busy}
          onClick={lock.onUnlock}
        >
          <Lock className="size-4" />
        </RightPanelIconButton>
      </TooltipTrigger>
      <TooltipContent>{lock.message}</TooltipContent>
    </Tooltip>
  )
}
