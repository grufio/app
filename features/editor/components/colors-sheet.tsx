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
 * `EditorTopLeftBar` (`z-20`) paints above it — the user keeps the
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
import { useTracePalette } from "@/lib/editor/trace/use-trace-palette"

import { PaletteColorTile } from "./palette-color-tile"

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
  const palette = useTracePalette(traceMode ?? "color")

  return (
    <section
      aria-label="Colors"
      className="absolute inset-0 flex flex-col overflow-hidden bg-background"
    >
      <header className="flex shrink-0 items-center border-b bg-background px-4 pt-16 pb-3">
        <h2 className="text-sm font-semibold">Colors</h2>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <ColorsBody
          paletteIndicesUsed={paletteIndicesUsed}
          hasTrace={hasTrace}
          palette={palette}
        />
      </div>
    </section>
  )
}

function ColorsBody({
  paletteIndicesUsed,
  hasTrace,
  palette,
}: {
  paletteIndicesUsed: number[] | null
  hasTrace: boolean
  palette: ReturnType<typeof useTracePalette>
}) {
  if (!hasTrace) {
    return <EmptyState text="Run a trace to see its colors." />
  }
  if (paletteIndicesUsed == null) {
    // Legacy trace row from before the palette_indices_used migration.
    // The user can re-run the trace to capture the data.
    return <EmptyState text="Re-run this trace to capture its referenced colors." />
  }
  if (paletteIndicesUsed.length === 0) {
    return <EmptyState text="This trace doesn't reference any palette colors." />
  }
  if (palette == null) {
    return <EmptyState text="Loading palette…" />
  }

  // /api/palette returns chips ordered by palette_index ASC, so
  // `palette[i]` is the chip with palette_index === i. Skip any
  // out-of-range indices defensively (shouldn't happen under normal
  // operation; defends against a server bug).
  const tiles = paletteIndicesUsed
    .map((idx) => ({ idx, chip: palette[idx] }))
    .filter((entry): entry is { idx: number; chip: NonNullable<typeof entry.chip> } => entry.chip != null)

  if (tiles.length === 0) {
    return <EmptyState text="This trace's referenced colors are not in the active palette." />
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {tiles.map(({ chip }, displayIdx) => (
        <PaletteColorTile
          key={chip.notation || displayIdx}
          legendNumber={displayIdx + 1}
          name={chip.color_name}
          notation={chip.notation}
          rgb={chip.rgb}
        />
      ))}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  )
}
