import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"

describe("db contract: workspace geometry is canonical µpx", () => {
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

