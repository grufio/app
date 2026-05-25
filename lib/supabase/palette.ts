/**
 * Trace palette accessor — reads the active Munsell palette from the DB.
 *
 * `color` → `lab_munsell` (128 colour chips); `bw` → `lab_grays` (48 grey
 * chips). Strictly separate palettes — no mixing. Chips carry the OKLab
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

/** One palette chip: OKLab (for matching) + RGB (the emitted colour). */
export type PaletteChip = {
  oklab: [number, number, number]
  rgb: [number, number, number]
}

type PaletteRow = {
  oklab_l: number
  oklab_a: number
  oklab_b: number
  rgb_r: number
  rgb_g: number
  rgb_b: number
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
  const { data, error } = await supabase
    // lab_* tables are untyped in the generated schema (see file header).
    .from(table as never)
    .select("oklab_l,oklab_a,oklab_b,rgb_r,rgb_g,rgb_b")
    .order("palette_index", { ascending: true })
  if (error) throw new Error(`Failed to read ${table} palette: ${error.message}`)
  const rows = (data ?? []) as unknown as PaletteRow[]
  if (rows.length === 0) throw new Error(`Palette ${table} is empty`)
  return rows.map((r) => ({
    oklab: [r.oklab_l, r.oklab_a, r.oklab_b],
    rgb: [r.rgb_r, r.rgb_g, r.rgb_b],
  }))
}
