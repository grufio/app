/**
 * Integration test: palette tables are seeded by migrations.
 *
 * Closes the gate behind the bw-mode pixelate/circulate 500 (root cause:
 * `lab_grays` left empty in prod because no migration seeded it; see
 * PR #311 / #313). `readTracePalette` throws on an empty table, the trace
 * server catches that into a 500 with stage `pixelate_process`.
 *
 * The existing unit test in `lib/supabase/palette.test.ts` covers the
 * accessor's throw-on-empty contract against a mocked Supabase. What
 * was missing — and what let `lab_grays` reach prod empty — is a
 * test that runs against a real migrated DB and asserts the seed
 * actually populated the table. That's what this file adds.
 */
import { beforeAll, describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"

import { getServiceClient } from "./_setup"

describe("palette tables are seeded by migrations", () => {
  let supabase: SupabaseClient<Database>

  beforeAll(() => {
    supabase = getServiceClient()
  })

  it("lab_grays has rows after migrations apply", async () => {
    // 48-row N-axis grey ramp from
    // supabase/migrations/20260527172214_seed_lab_grays.sql.
    // `lab_grays` / `lab_munsell` aren't in the generated Supabase
    // types yet (a `types:gen` regen is pending — see lib/supabase/
    // palette.ts header), so the table name is cast.
    const { count, error } = await supabase
      .from("lab_grays" as never)
      .select("*", { count: "exact", head: true })
    expect(error).toBeNull()
    expect(count ?? 0).toBeGreaterThan(0)
  })

  it("lab_munsell has the 512-chip tier palette after migrations apply", async () => {
    // Authoritative re-seed in
    // supabase/migrations/20260604160000_reseed_lab_munsell_512.sql:
    // 512 chips, palette_index = selection rank 0..511 (tiers are prefixes),
    // iscc_nbs_name backfilled via derive_iscc_nbs_name(). This closes the
    // out-of-band-seed gap that previously left lab_munsell unmigrated.
    const { data, count, error } = await supabase
      .from("lab_munsell" as never)
      .select("palette_index,iscc_nbs_name", { count: "exact" })
      .order("palette_index", { ascending: true })
    expect(error).toBeNull()
    expect(count).toBe(512)
    const rows = (data ?? []) as unknown as {
      palette_index: number
      iscc_nbs_name: string | null
    }[]
    // Contiguous 0..511 (the active-tier prefix contract relies on this).
    expect(rows.map((r) => r.palette_index)).toEqual(
      Array.from({ length: 512 }, (_, i) => i),
    )
    // Every chip carries an ISCC-NBS name (backfill covered all 512).
    expect(rows.every((r) => r.iscc_nbs_name != null)).toBe(true)
  })
})
