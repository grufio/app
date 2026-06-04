/**
 * Trace palette accessor — reads the active Munsell palette from the DB.
 *
 * `color` → `lab_munsell` (512-chip tier palette, limited at runtime to the
 * active tier — see `activeColorTier`); `bw` → `lab_grays` (48 grey chips).
 * Strictly separate palettes — no mixing. Chips carry the OKLab
 * columns straight from color-lab, so a cell's OKLab (computed with the same
 * transform, `lib/color/oklab.ts` / `filter-service/app/oklab.py`) matches in
 * the same space.
 *
 * NOTE: `lab_munsell` / `lab_grays` are not in the generated Supabase types
 * yet (a `types:gen` regen is pending — see the project memory). The table
 * access is therefore cast; the selected columns + row shape are pinned here
 * so every caller stays fully typed.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "./database.types"

export type TraceColorMode = "color" | "bw"

/** Default active colour tier when `PALETTE_TIER` is unset/invalid. */
const DEFAULT_COLOR_TIER = 128

/**
 * Active colour-palette tier: how many of the 512 `lab_munsell` chips the app
 * uses, as a prefix of `palette_index` (= selection rank, so a prefix is always
 * the best-N). Grow 128 → 256 → 512 by setting `PALETTE_TIER`; no DB change,
 * because all 512 are already seeded. Applies to `color` only — `lab_grays`
 * (bw, 48 chips) is not tiered.
 */
function activeColorTier(): number {
  const raw = Number(process.env.PALETTE_TIER)
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_COLOR_TIER
}

/** One palette chip: OKLab (for matching) + RGB (the emitted colour),
 *  plus the chip's Munsell notation and ISCC-NBS Level-3 name for
 *  display. `iscc_nbs_name` is nullable in case a chip falls outside
 *  every named block; callers should fall back to `notation`. */
export type PaletteChip = {
  oklab: [number, number, number]
  rgb: [number, number, number]
  notation: string
  iscc_nbs_name: string | null
}

type PaletteRow = {
  oklab_l: number
  oklab_a: number
  oklab_b: number
  rgb_r: number
  rgb_g: number
  rgb_b: number
  notation: string
  iscc_nbs_name: string | null
}

/**
 * Read the active palette, ordered by `palette_index`. Throws on a DB error
 * or an empty palette (a trace can't render without chips).
 */
export async function readTracePalette(
  supabase: SupabaseClient<Database>,
  mode: TraceColorMode,
): Promise<PaletteChip[]> {
  const table = mode === "bw" ? "lab_grays" : "lab_munsell"
  // lab_* tables are untyped in the generated schema (see file header).
  let query = supabase
    .from(table as never)
    .select("oklab_l,oklab_a,oklab_b,rgb_r,rgb_g,rgb_b,notation,iscc_nbs_name")
    .order("palette_index", { ascending: true })
  // Colour palette is tiered: take only the active prefix of the 512 chips.
  if (mode === "color") query = query.limit(activeColorTier())
  const { data, error } = await query
  if (error) throw new Error(`Failed to read ${table} palette: ${error.message}`)
  const rows = (data ?? []) as unknown as PaletteRow[]
  if (rows.length === 0) throw new Error(`Palette ${table} is empty`)
  return rows.map((r) => ({
    oklab: [r.oklab_l, r.oklab_a, r.oklab_b],
    rgb: [r.rgb_r, r.rgb_g, r.rgb_b],
    notation: r.notation,
    iscc_nbs_name: r.iscc_nbs_name,
  }))
}
