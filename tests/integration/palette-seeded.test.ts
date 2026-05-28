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

  // lab_munsell is currently loaded out-of-band in prod and has no
  // migration that seeds it — the same gap that caused the bw-mode
  // 500 still exists for the colour palette. Marking the gate as
  // `todo` here so the missing migration isn't forgotten; flip to
  // `it(...)` once a seed migration lands.
  it.todo("lab_munsell has rows after migrations apply")
})
