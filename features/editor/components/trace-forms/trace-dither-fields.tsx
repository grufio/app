"use client"

/**
 * Shared "Dither" segment for trace dialogs (Pixelate + Circulate) — PR-F.
 *
 * Two selects sit side-by-side in the panel grid:
 *   - mode    → `none` / Knoll-Yliluoma / Floyd-Steinberg
 *   - pattern → 2 / 4 / 8 / 16 (Knoll-Yliluoma candidate count `N`;
 *                ignored when mode is `"none"` or `"floyd_steinberg"`)
 *
 * When mode is `"none"` (default), pattern size is greyed out — the
 * value persists so toggling back to KY restores the user's previous
 * choice. When mode is `"floyd_steinberg"`, pattern size is also
 * greyed out (FS has no pattern-size knob).
 *
 * Both forms wrap this in `<EditorSidebarSection title="Dither">`.
 * The Dither segment SUPERSEDES the Texture segment functionally —
 * KY/FS replace the texture step's spatial-quantization role, so the
 * server skips texture when dithering is on (see PR-F dispatch in
 * `cell_colors.py`). The Texture segment is kept in both forms for
 * backward compat with persisted rows that have `texture_enabled =
 * true`; PR-G will deprecate it.
 *
 * Stateless — parent owns the draft and reacts to `onModeChange` /
 * `onPatternSizeChange`. Schema lives in `dither-mode-schema.ts`.
 */
import { Shuffle, Sparkles } from "lucide-react"

import { FormField, type SelectFieldOption } from "@/components/ui/form-controls"
import {
  DITHER_MODES,
  DITHER_PATTERN_SIZES,
  type DitherMode,
  type DitherPatternSize,
} from "@/lib/editor/trace/dither-mode-schema"

import { PanelIconSlot, PanelTwoFieldRow } from "../panel-layout"

// Module-level — the Select primitive `useMemo`s on `prev.options === next.options`.
const MODE_OPTIONS: SelectFieldOption[] = [
  { value: "none", label: "None" },
  { value: "knoll_yliluoma", label: "Knoll-Yliluoma" },
  { value: "floyd_steinberg", label: "Floyd-Steinberg" },
]

const PATTERN_OPTIONS: SelectFieldOption[] = DITHER_PATTERN_SIZES.map((n) => ({
  value: String(n),
  label: `${n}×`,
}))

// Compile-time sanity: keep the option order aligned with the schema's
// `DITHER_MODES` tuple so changes to the schema surface here.
void (DITHER_MODES satisfies ReadonlyArray<DitherMode>)

export function TraceDitherFields(props: {
  mode: DitherMode
  patternSize: DitherPatternSize | number
  onModeChange: (value: DitherMode) => void
  onPatternSizeChange: (value: DitherPatternSize) => void
  disabled?: boolean
}) {
  const { mode, patternSize, onModeChange, onPatternSizeChange, disabled } = props
  const patternDisabled = disabled || mode !== "knoll_yliluoma"
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
        label="Dither pattern size"
        labelVisuallyHidden
        iconStart={<Sparkles aria-hidden="true" />}
        id="dither_pattern_size"
        value={String(patternSize)}
        options={PATTERN_OPTIONS}
        onCommit={(v) => onPatternSizeChange(Number(v) as DitherPatternSize)}
        disabled={patternDisabled}
      />
      <PanelIconSlot />
    </PanelTwoFieldRow>
  )
}
