/**
 * Trace palette accessor — reads the active Munsell palette from the DB.
 *
 * `color` → the active tier of `lab_munsell` (see `activeColorTier`) PLUS the
 * 48 `lab_grays` chips appended, so near-neutral cells snap to a real gray;
 * `bw` → `lab_grays` only. Chips carry the OKLab
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

/** Default active colour tier when `PALETTE_TIER` is unset/invalid.
 *  Raised 128 → 256 once the 512-chip palette was live (all 512 seeded). */
const DEFAULT_COLOR_TIER = 256

/**
 * Active colour-palette tier: how many of the 512 `lab_munsell` chips the app
 * uses, as a prefix of `palette_index` (= selection rank, so a prefix is always
 * the best-N). Grow 256 → 512 by bumping `DEFAULT_COLOR_TIER` (or the
 * `PALETTE_TIER` override); no DB change, because all 512 are already seeded.
 * Applies to `color` only — `lab_grays` (bw, 48 chips) is not tiered.
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

type PaletteTable = "lab_munsell" | "lab_grays"

/**
 * Read one palette table → chips, ordered by `palette_index`. `limit` caps the
 * row count (the colour tier). Throws on a DB error; an empty result is the
 * caller's decision to handle.
 */
async function readPaletteRows(
  supabase: SupabaseClient<Database>,
  table: PaletteTable,
  limit?: number,
): Promise<PaletteChip[]> {
  // lab_* tables are untyped in the generated schema (see file header).
  let query = supabase
    .from(table as never)
    .select("oklab_l,oklab_a,oklab_b,rgb_r,rgb_g,rgb_b,notation,iscc_nbs_name")
    .order("palette_index", { ascending: true })
  if (limit != null) query = query.limit(limit)
  const { data, error } = await query
  if (error) throw new Error(`Failed to read ${table} palette: ${error.message}`)
  return ((data ?? []) as unknown as PaletteRow[]).map((r) => ({
    oklab: [r.oklab_l, r.oklab_a, r.oklab_b],
    rgb: [r.rgb_r, r.rgb_g, r.rgb_b],
    notation: r.notation,
    iscc_nbs_name: r.iscc_nbs_name,
  }))
}

/**
 * Read the active palette.
 *
 * `bw` → `lab_grays` (48). `color` → the active tier of `lab_munsell` PLUS the
 * full 48-step `lab_grays` ramp, appended at the end. Near-neutral cells then
 * snap to a real gray instead of the few muted low-chroma chips the chromatic
 * palette offers (it has ~1 chip below OKLab-chroma 0.02) — this is what fixes
 * the heavy banding on neutral images. Grays are appended LAST so existing
 * munsell array positions (= stored `palette_indices_used`) stay valid;
 * everything downstream keys off the array position, not the DB `palette_index`.
 *
 * Throws on a DB error or an empty required palette (`lab_munsell` for colour,
 * `lab_grays` for bw). An empty or failed `lab_grays` read in COLOUR mode is
 * non-fatal — it falls back to munsell-only so a grays issue can't break colour
 * traces.
 */
export async function readTracePalette(
  supabase: SupabaseClient<Database>,
  mode: TraceColorMode,
): Promise<PaletteChip[]> {
  if (mode === "bw") {
    const grays = await readPaletteRows(supabase, "lab_grays")
    if (grays.length === 0) throw new Error("Palette lab_grays is empty")
    return grays
  }
  const [munsell, grays] = await Promise.all([
    readPaletteRows(supabase, "lab_munsell", activeColorTier()),
    readPaletteRows(supabase, "lab_grays").catch(() => [] as PaletteChip[]),
  ])
  if (munsell.length === 0) throw new Error("Palette lab_munsell is empty")
  return [...munsell, ...grays]
}
