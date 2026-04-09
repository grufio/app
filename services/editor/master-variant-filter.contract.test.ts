import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("db contract: master immutable + filter stack", () => {
  const migrationFile = "037_master_variant_filter_contract.sql"
  const migrationPath = path.join(process.cwd(), "db", "_archive", migrationFile)

  it("migration enforces one master per project and immutable master guard", () => {
    const sql = fs.readFileSync(migrationPath, "utf8")
    expect(sql).toMatch(/create unique index if not exists project_images_one_master_per_project_idx/)
    expect(sql).toMatch(/where role = 'master' and deleted_at is null;/)
    expect(sql).toMatch(/create or replace function public\.guard_master_immutable\(\)/)
    expect(sql).toMatch(/raise exception using\s+message = 'master image is immutable'/m)
    expect(sql).toMatch(/create trigger trg_project_images_guard_master_immutable/)
  })

  it("migration defines project_image_filters with stack order and lineage refs", () => {
    const sql = fs.readFileSync(migrationPath, "utf8")
    expect(sql).toMatch(/create table if not exists public\.project_image_filters/)
    expect(sql).toMatch(/input_image_id uuid not null references public\.project_images\(id\) on delete restrict/)
    expect(sql).toMatch(/output_image_id uuid not null references public\.project_images\(id\) on delete restrict/)
    expect(sql).toMatch(/constraint project_image_filters_project_stack_order_uidx unique \(project_id, stack_order\)/)
  })

  it("schema.sql and bootstrap include migration markers", () => {
    const schema = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8")
    const bootstrap = fs.readFileSync(
      path.join(process.cwd(), "supabase", "migrations", "20260129111414_bootstrap_from_db_folder.sql"),
      "utf8"
    )
    expect(schema).toContain("BEGIN db/037_master_variant_filter_contract.sql")
    expect(schema).toContain("END db/037_master_variant_filter_contract.sql")
    expect(bootstrap).toContain("db/037_master_variant_filter_contract.sql")
  })
})

