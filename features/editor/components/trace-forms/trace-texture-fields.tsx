"use client"

/**
 * Shared "Texture" segment for trace dialogs (Pixelate + Circulate).
 *
 * A Select-dropdown with four discrete strength levels (25/50/75/100 %) sits
 * in the left/middle of the panel grid; the enable Checkbox sits in the right
 * `PanelIconSlot`, the same slot that holds the unsized spacer in other
 * sections. With the checkbox off the dropdown greys out but retains its
 * last value, mirroring the `inner_enabled` / inner-ellipse pattern in
 * `circulate-form.tsx`. Both forms wrap this in `<EditorSidebarSection
 * title="Texture">` so the segment label stays consistent.
 *
 * Schema-side `texture_strength` is stored as a 0..1 fraction (matching the
 * filter-service's `texture_strength` request field); the Select trades it
 * as a string ("0.25", "0.5", "0.75", "1") because Radix Select is
 * string-valued. The conversion is one `Number()` / `String()` round-trip
 * either side — no extra state.
 */
import { Sparkles } from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import { FormField, type SelectFieldOption } from "@/components/ui/form-controls"

import { PanelIconSlot, PanelTwoFieldRow } from "../panel-layout"

// Module-level — the Select primitive `useMemo`s on `prev.options === next.options`.
const STRENGTH_OPTIONS: SelectFieldOption[] = [
  { value: "0.25", label: "25 %" },
  { value: "0.5", label: "50 %" },
  { value: "0.75", label: "75 %" },
  { value: "1", label: "100 %" },
]

export function TraceTextureFields(props: {
  enabled: boolean
  strength: number
  onEnabledChange: (value: boolean) => void
  onStrengthChange: (value: number) => void
  disabled?: boolean
}) {
  const { enabled, strength, onEnabledChange, onStrengthChange, disabled } = props
  return (
    <PanelTwoFieldRow>
      <div className="col-span-2">
        <FormField
          variant="select"
          label="Texture strength"
          labelVisuallyHidden
          iconStart={<Sparkles aria-hidden="true" />}
          id="texture_strength"
          value={String(strength)}
          options={STRENGTH_OPTIONS}
          onCommit={(v) => onStrengthChange(Number(v))}
          disabled={disabled || !enabled}
        />
      </div>
      <PanelIconSlot>
        <Checkbox
          id="texture_enabled"
          checked={enabled}
          onCheckedChange={(c) => onEnabledChange(c === true)}
          disabled={disabled}
          aria-label="Enable texture"
        />
      </PanelIconSlot>
    </PanelTwoFieldRow>
  )
}
