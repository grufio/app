"use client"

/**
 * Colors section view (renders on both viewports).
 *
 * First-class section (editorSection === "colors") that lists the
 * palette chips the current trace actually references — not the full
 * Munsell palette (active tier of up to 512). Each chip renders as a
 * `PaletteColorTile` (solid color fill + legend number + colour name
 * + Munsell notation).
 *
 * **Not a dialog.** This is a regular section view that sits inside
 * the editor layout (`absolute inset-0`, no z-index) so the floating
 * the floating bars (`z-20`) paint above it — the user keeps the
 * navigation icons in view and switches away via Image / Filter /
 * Trace just like in any other section. No Close button, no Edit
 * button on the top-right bar; Colors has nothing to "edit".
 *
 * The header has `pt-16` to push the "Colors" title clear of the
 * floating top-left bar (top-3 anchor + 36 px tall = bottom edge at
 * 48 px; pt-16 puts the title at 64 px — 16 px breathing room).
 *
 * Data flow:
 *   - `trace.palette_indices_used`: list of palette chip indices (or
 *     `null` for legacy rows pre-migration).
 *   - `traceMode` ("color" | "bw"): selects which palette to look up
 *     against (lab_munsell vs. lab_grays).
 *   - `useTracePalette(traceMode)`: cached full-palette fetch.
 *
 * Chips are read positionally — `/api/palette` orders by
 * `palette_index` ASC so `palette[i]` is the chip with
 * `palette_index === i`.
 */
import { PaletteColorGrid } from "./palette-color-grid"

type ColorsSheetProps = {
  /** The current trace's used-palette index list. `null` for legacy
   * rows pre-migration (column was added empty). */
  paletteIndicesUsed: number[] | null
  /** Which palette to look up against. `null` when no trace is
   * active. */
  traceMode: "color" | "bw" | null
  /** True when no trace is active at all. */
  hasTrace: boolean
}

export function ColorsSheet({
  paletteIndicesUsed,
  traceMode,
  hasTrace,
}: ColorsSheetProps) {
  return (
    <section
      aria-label="Colors"
      className="absolute inset-0 flex flex-col overflow-hidden bg-background"
    >
      <header className="flex shrink-0 items-center border-b bg-background px-4 pt-16 pb-3">
        <h2 className="text-sm font-semibold">Colors</h2>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <PaletteColorGrid
          paletteIndicesUsed={paletteIndicesUsed}
          traceMode={traceMode}
          hasTrace={hasTrace}
        />
      </div>
    </section>
  )
}
