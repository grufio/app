"use client"

/**
 * Palette color grid — the reusable body that lists the palette chips a trace
 * actually references, as a grid of `PaletteColorTile`s.
 *
 * Extracted from `ColorsSheet` so it can be shared between the (soon-to-be-
 * removed) Colors stepper section and the new Colors dialog on the Trace
 * section — no section/dialog chrome of its own, just the empty-states + the
 * positional join into the full palette + the grid.
 *
 * Data flow:
 *   - `paletteIndicesUsed`: the trace's used-palette index list (`null` for
 *     legacy rows pre-migration and for linerate — no palette).
 *   - `traceMode` ("color" | "bw"): which palette to look up against.
 *   - `useTracePalette(traceMode)`: cached full-palette fetch. Chips are read
 *     positionally — `/api/palette` orders by `palette_index` ASC so
 *     `palette[i]` is the chip with `palette_index === i`.
 */
import { useTracePalette } from "@/lib/editor/trace/use-trace-palette"

import { PaletteColorTile } from "./palette-color-tile"

type Props = {
  /** The current trace's used-palette index list. `null` for legacy rows
   * pre-migration (column was added empty) and for linerate. */
  paletteIndicesUsed: number[] | null
  /** Which palette to look up against. `null` when no trace is active. */
  traceMode: "color" | "bw" | null
  /** True when a trace is active at all. */
  hasTrace: boolean
}

export function PaletteColorGrid({ paletteIndicesUsed, traceMode, hasTrace }: Props) {
  const palette = useTracePalette(traceMode ?? "color")

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

  // /api/palette returns chips ordered by palette_index ASC, so `palette[i]` is
  // the chip with palette_index === i. Skip any out-of-range indices defensively
  // (shouldn't happen under normal operation; defends against a server bug).
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
