"use client"

/**
 * Shared "Palette cap" segment for trace dialogs (Pixelate + Circulate)
 * — PR-I.
 *
 * Single select for the palette-cap strategy:
 *   - "Häufigster Chip (Top-N)"     → `palette_restriction = "top_n"`
 *                                      (default, pre-PR-I semantics —
 *                                      post-snap count-based cap)
 *   - "Cluster-Medoide (PAM)"       → `palette_restriction = "pam"`
 *                                      (pre-snap k-medoid restriction
 *                                      via Kaufman & Rousseeuw 1987,
 *                                      spread-optimal)
 *
 * PAM uses the active `distance_metric` for its distance matrix
 * (CIEDE2000 + PAM is a valid combination). See
 * `lib/editor/trace/palette-restriction-schema.ts` for the trade-off
 * and the interaction with the other switch fields.
 *
 * Both forms wrap this in `<EditorSidebarSection title="Palette">`.
 *
 * Stateless — parent owns the draft and reacts to `onRestrictionChange`.
 */
import { Boxes } from "lucide-react"

import { FormField, type SelectFieldOption } from "@/components/ui/form-controls"
import {
  PALETTE_RESTRICTIONS,
  type PaletteRestriction,
} from "@/lib/editor/trace/palette-restriction-schema"

import { PanelIconSlot, PanelTwoFieldRow } from "../panel-layout"

const RESTRICTION_OPTIONS: SelectFieldOption[] = [
  { value: "top_n", label: "Häufigster Chip (Top-N)" },
  { value: "pam", label: "Cluster-Medoide (PAM)" },
]

// Compile-time sanity: keep the option order aligned with the schema.
void (PALETTE_RESTRICTIONS satisfies ReadonlyArray<PaletteRestriction>)

export function TracePaletteRestrictionFields(props: {
  restriction: PaletteRestriction
  onRestrictionChange: (value: PaletteRestriction) => void
  disabled?: boolean
}) {
  const { restriction, onRestrictionChange, disabled } = props
  return (
    <PanelTwoFieldRow>
      <div className="col-span-2">
        <FormField
          variant="select"
          label="Palette restriction"
          labelVisuallyHidden
          iconStart={<Boxes aria-hidden="true" />}
          id="palette_restriction"
          value={restriction}
          options={RESTRICTION_OPTIONS}
          onCommit={(v) => onRestrictionChange(v as PaletteRestriction)}
          disabled={disabled}
        />
      </div>
      <PanelIconSlot />
    </PanelTwoFieldRow>
  )
}
