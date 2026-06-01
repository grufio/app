"use client"

/**
 * Single chip tile for the mobile Colors sheet. A solid color fill +
 * three short text rows:
 *
 *   1. legend number — 1-based position of this chip in the visible
 *      sequence (NOT the palette_index; that would jump around as
 *      sparse subsets render)
 *   2. ISCC-NBS Level-3 name (e.g. "Vivid red", or "—" if the chip
 *      falls outside every named block)
 *   3. Munsell notation (e.g. "5R 4/14")
 *
 * Square aspect-ratio for the color block; the text rows sit below.
 * Sizing is left to the parent grid — this primitive only knows how
 * to render one tile.
 */

export function PaletteColorTile({
  legendNumber,
  name,
  notation,
  rgb,
}: {
  legendNumber: number
  name: string | null
  notation: string
  rgb: readonly [number, number, number]
}) {
  const [r, g, b] = rgb
  return (
    <div className="overflow-hidden rounded-md border bg-background">
      <div
        className="aspect-square w-full"
        style={{ backgroundColor: `rgb(${r}, ${g}, ${b})` }}
        aria-hidden="true"
      />
      <div className="space-y-0.5 p-2 text-[12px] leading-tight">
        <div className="font-semibold tabular-nums">{legendNumber}</div>
        <div className="line-clamp-1 text-muted-foreground">{name ?? "—"}</div>
        <div className="text-muted-foreground tabular-nums">{notation}</div>
      </div>
    </div>
  )
}
