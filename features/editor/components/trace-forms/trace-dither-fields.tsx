"use client"

/**
 * Shared "Dither" segment for trace dialogs (Pixelate + Circulate).
 *
 * Two selects sit side-by-side in the panel grid:
 *   - mode      → `None` / Knoll-Yliluoma / Floyd-Steinberg / Texture
 *   - strength  → 25 % / 50 % / 75 % / 100 % (consumed by Knoll-Yliluoma
 *                  and Texture; ignored by None and Floyd-Steinberg)
 *
 * Strength is greyed out for `none` / `floyd_steinberg`. The value
 * persists through mode switches so toggling back to KY or Texture
 * restores the user's previous choice.
 *
 * The "Texture" mode subsumes the former standalone Texture
 * checkbox+strength block. Algorithmically all three non-trivial
 * modes belong to the same family (blue-noise modulated palette
 * modification); presenting them as a single one-of selector
 * eliminates the artificial mutual-exclusion disable the form used
 * to enforce between Dither and Texture.
 *
 * Stateless — parent owns the draft and reacts to `onModeChange` /
 * `onStrengthChange`. Schema lives in `dither-mode-schema.ts`.
 */
import { Shuffle, Sparkles } from "lucide-react"

import { FormField, type SelectFieldOption } from "@/components/ui/form-controls"
import {
  DITHER_MODES,
  DITHER_STRENGTHS,
  type DitherMode,
  type DitherStrength,
} from "@/lib/editor/trace/dither-mode-schema"

import { PanelIconSlot, PanelTwoFieldRow } from "../panel-layout"

// Module-level — the Select primitive `useMemo`s on `prev.options === next.options`.
const MODE_OPTIONS: SelectFieldOption[] = [
  { value: "none", label: "None" },
  { value: "knoll_yliluoma", label: "Knoll-Yliluoma" },
  { value: "floyd_steinberg", label: "Floyd-Steinberg" },
  { value: "texture", label: "Texture" },
]

const STRENGTH_OPTIONS: SelectFieldOption[] = DITHER_STRENGTHS.map((s) => ({
  value: String(s),
  label: `${Math.round(s * 100)} %`,
}))

// Compile-time sanity: keep the option order aligned with the schema's
// `DITHER_MODES` tuple so changes to the schema surface here.
void (DITHER_MODES satisfies ReadonlyArray<DitherMode>)

export function TraceDitherFields(props: {
  mode: DitherMode
  strength: DitherStrength | number
  onModeChange: (value: DitherMode) => void
  onStrengthChange: (value: DitherStrength) => void
  disabled?: boolean
}) {
  const { mode, strength, onModeChange, onStrengthChange, disabled } = props
  const strengthDisabled =
    disabled || mode === "none" || mode === "floyd_steinberg"
  return (
    <PanelTwoFieldRow>
      <FormField
        variant="select"
        label="Dither mode"
        labelVisuallyHidden
        iconStart={<Shuffle aria-hidden="true" />}
        id="dither_mode"
        value={mode}
        options={MODE_OPTIONS}
        onCommit={(v) => onModeChange(v as DitherMode)}
        disabled={disabled}
      />
      <FormField
        variant="select"
        label="Dither strength"
        labelVisuallyHidden
        iconStart={<Sparkles aria-hidden="true" />}
        id="dither_strength"
        value={String(strength)}
        options={STRENGTH_OPTIONS}
        onCommit={(v) => onStrengthChange(Number(v) as DitherStrength)}
        disabled={strengthDisabled}
      />
      <PanelIconSlot />
    </PanelTwoFieldRow>
  )
}
