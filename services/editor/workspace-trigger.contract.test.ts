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
})

