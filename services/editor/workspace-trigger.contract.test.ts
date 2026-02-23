import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"

describe("db contract: workspace geometry is canonical µpx", () => {
  it("workspace trigger function hardens search_path and removes artboard_dpi", () => {
    const sqlPath = path.join(process.cwd(), "db/035_remove_artboard_dpi_and_harden_workspace_insert.sql")
    const sql = fs.readFileSync(sqlPath, "utf8")

    expect(sql).toMatch(/alter function public\.project_workspace_sync_px_cache\(\)\s+set search_path = public, pg_temp;/)
    expect(sql).toMatch(/alter column width_px_u set not null,\s+alter column height_px_u set not null;/)
    expect(sql).toMatch(/add constraint project_workspace_width_px_u_positive check/)
    expect(sql).toMatch(/add constraint project_workspace_height_px_u_positive check/)
    expect(sql).toMatch(/add constraint project_workspace_px_cache_consistency check/)
    expect(sql).toMatch(/drop column if exists artboard_dpi;/)
  })

  it("workspace trigger UPDATE path does not recompute geometry from unit/value/dpi", () => {
    const sqlPath = path.join(process.cwd(), "db/035_remove_artboard_dpi_and_harden_workspace_insert.sql")
    const sql = fs.readFileSync(sqlPath, "utf8")

    const updateIdx = sql.indexOf("if tg_op = 'UPDATE'")
    expect(updateIdx).toBeGreaterThanOrEqual(0)

    const elseIdx = sql.indexOf("\n  else", updateIdx)
    expect(elseIdx).toBeGreaterThan(updateIdx)

    const updateBranch = sql.slice(updateIdx, elseIdx)
    expect(updateBranch).not.toMatch(/workspace_value_to_px_u/)
    expect(updateBranch).not.toMatch(/\bwidth_value\b/)
    expect(updateBranch).not.toMatch(/\bheight_value\b/)
    expect(updateBranch).not.toMatch(/\bunit\b/)
    expect(updateBranch).not.toMatch(/\bartboard_dpi\b/)
    expect(updateBranch).not.toMatch(/\boutput_dpi\b/)
  })

  it("workspace trigger INSERT path requires canonical µpx fields (no dpi fallback)", () => {
    const sqlPath = path.join(process.cwd(), "db/035_remove_artboard_dpi_and_harden_workspace_insert.sql")
    const sql = fs.readFileSync(sqlPath, "utf8")

    const elseIdx = sql.indexOf("\n  else")
    expect(elseIdx).toBeGreaterThanOrEqual(0)
    const endIfIdx = sql.indexOf("\n  end if;", elseIdx)
    expect(endIfIdx).toBeGreaterThan(elseIdx)

    const insertBranch = sql.slice(elseIdx, endIfIdx)
    expect(insertBranch).not.toMatch(/workspace_value_to_px_u/)
    expect(insertBranch).not.toMatch(/\bartboard_dpi\b/)
    expect(insertBranch).not.toMatch(/\boutput_dpi\b/)
    expect(insertBranch).toMatch(/raise exception/)
  })

  it("workspace trigger derives integer px caches from canonical µpx (half-up rounding)", () => {
    const sqlPath = path.join(process.cwd(), "db/035_remove_artboard_dpi_and_harden_workspace_insert.sql")
    const sql = fs.readFileSync(sqlPath, "utf8")

    expect(sql).toMatch(/new\.width_px := greatest\(1, \(\(w_u \+ 500000\) \/ 1000000\)::int\);/)
    expect(sql).toMatch(/new\.height_px := greatest\(1, \(\(h_u \+ 500000\) \/ 1000000\)::int\);/)
    expect(sql).toMatch(/add constraint project_workspace_px_cache_consistency check \(\s+width_px = greatest\(1, \(\(\(width_px_u::bigint\) \+ 500000\) \/ 1000000\)::int\) and\s+height_px = greatest\(1, \(\(\(height_px_u::bigint\) \+ 500000\) \/ 1000000\)::int\)\s+\);/m)
  })

  it("workspace trigger UPDATE branch only inherits µpx when null (no recompute)", () => {
    const sqlPath = path.join(process.cwd(), "db/035_remove_artboard_dpi_and_harden_workspace_insert.sql")
    const sql = fs.readFileSync(sqlPath, "utf8")

    const updateIdx = sql.indexOf("if tg_op = 'UPDATE'")
    expect(updateIdx).toBeGreaterThanOrEqual(0)
    const elseIdx = sql.indexOf("\n  else", updateIdx)
    expect(elseIdx).toBeGreaterThan(updateIdx)

    const updateBranch = sql.slice(updateIdx, elseIdx)
    expect(updateBranch).toMatch(/if new\.width_px_u is null then new\.width_px_u := old\.width_px_u; end if;/)
    expect(updateBranch).toMatch(/if new\.height_px_u is null then new\.height_px_u := old\.height_px_u; end if;/)
  })

  it("bootstrap migration applies a final workspace trigger with no DPI-based recompute", () => {
    const sqlPath = path.join(process.cwd(), "supabase/migrations/20260129111414_bootstrap_from_db_folder.sql")
    const sql = fs.readFileSync(sqlPath, "utf8")

    const marker = "create or replace function public.project_workspace_sync_px_cache()"
    const idx = sql.lastIndexOf(marker)
    expect(idx).toBeGreaterThanOrEqual(0)
    const endIdx = sql.indexOf("$$;", idx)
    expect(endIdx).toBeGreaterThan(idx)
    const fn = sql.slice(idx, endIdx)

    expect(fn).toMatch(/raise exception/)
    expect(fn).toMatch(/new\.width_px := greatest\(1, \(\(w_u \+ 500000\) \/ 1000000\)::int\);/)
    expect(fn).toMatch(/new\.height_px := greatest\(1, \(\(h_u \+ 500000\) \/ 1000000\)::int\);/)
    expect(fn).not.toMatch(/\bartboard_dpi\b/)
    expect(fn).not.toMatch(/\boutput_dpi\b/)
    expect(fn).not.toMatch(/workspace_value_to_px_u/)
    expect(fn).not.toMatch(/\bwidth_value\b/)
    expect(fn).not.toMatch(/\bheight_value\b/)
  })

  it("schema.sql final workspace trigger has no DPI-based recompute", () => {
    const sqlPath = path.join(process.cwd(), "db/schema.sql")
    const sql = fs.readFileSync(sqlPath, "utf8")

    const marker = "create or replace function public.project_workspace_sync_px_cache()"
    const idx = sql.lastIndexOf(marker)
    expect(idx).toBeGreaterThanOrEqual(0)
    const endIdx = sql.indexOf("$$;", idx)
    expect(endIdx).toBeGreaterThan(idx)
    const fn = sql.slice(idx, endIdx)

    expect(fn).toMatch(/raise exception/)
    expect(fn).not.toMatch(/\bartboard_dpi\b/)
    expect(fn).not.toMatch(/\boutput_dpi\b/)
    expect(fn).not.toMatch(/workspace_value_to_px_u/)
    expect(fn).not.toMatch(/\bwidth_value\b/)
    expect(fn).not.toMatch(/\bheight_value\b/)
  })
})

