"use client"

/**
 * Mobile full-screen Colors sheet.
 *
 * Shows the palette chips the current trace actually references — not
 * the full 128-chip Munsell palette. Each chip renders as a
 * `PaletteColorTile` (solid color fill + legend number + ISCC-NBS name
 * + Munsell notation).
 *
 * Opens via the Palette icon in the editor's bottom-nav. Render shape
 * mirrors `MobileTraceSheet` / `MobileFilterSheet`: absolute overlay
 * inside the editor layout container, header + scrollable body, the
 * bottom-nav stays as a flex-sibling underneath.
 *
 * Data flow:
 *   - `trace.palette_indices_used`: list of palette chip indices (or
 *     `null` for legacy rows pre-migration and for lineart).
 *   - `traceMode` ("color" | "bw"): selects which palette to look up
 *     against (lab_munsell vs. lab_grays).
 *   - `useTracePalette(traceMode)`: cached full-palette fetch. Returns
 *     `null` until loaded.
 *
 * The chips at `palette_indices_used` are read positionally from the
 * loaded palette array — `/api/palette` orders by `palette_index`
 * ascending so `palette[i]` is the chip with `palette_index === i`.
 */
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useTracePalette } from "@/lib/editor/trace/use-trace-palette"

import { PaletteColorTile } from "./palette-color-tile"

type MobileColorsSheetProps = {
  onClose: () => void
  /** The current trace's used-palette index list. `null` for legacy
   * rows pre-migration (column was added empty). */
  paletteIndicesUsed: number[] | null
  /** Which palette to look up against. `null` when no trace is
   * active. */
  traceMode: "color" | "bw" | null
  /** True when no trace is active at all. */
  hasTrace: boolean
}

export function MobileColorsSheet({
  onClose,
  paletteIndicesUsed,
  traceMode,
  hasTrace,
}: MobileColorsSheetProps) {
  const palette = useTracePalette(traceMode ?? "color")

  return (
    <section
      aria-label="Colors"
      className="absolute inset-0 z-30 flex flex-col overflow-hidden bg-background md:hidden"
    >
      <header className="flex shrink-0 items-center justify-between border-b bg-background px-4 py-3">
        <h2 className="text-sm font-semibold">Colors</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Close"
          onClick={onClose}
        >
          <X aria-hidden="true" className="size-5" />
        </Button>
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
          name={chip.iscc_nbs_name}
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
