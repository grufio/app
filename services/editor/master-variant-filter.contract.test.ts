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

  it("schema.sql reflects the master-variant-filter contract from migration 037", () => {
    // The historical assertion also grepped the bootstrap migration file for
    // a literal `db/037_…` reference (audit chain). After the migration squash
    // (2026-05-09) the bootstrap files are gone — the structural items are
    // what we actually care about, and `db/schema.sql` is now the single
    // source for that check.
    const schema = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8")

    // master-immutable guard function present
    expect(schema).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+"?public"?\."?guard_master_immutable"?/i)

    // master-immutable trigger wired up on project_images
    expect(schema).toMatch(
      /CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+"?trg_project_images_guard_master_immutable"?/i,
    )

    // project_image_filters table exists with stack_order unique constraint
    expect(schema).toMatch(/CREATE\s+TABLE[\s\S]+?"?public"?\."?project_image_filters"?/i)
    expect(schema).toMatch(/UNIQUE[\s\S]{0,80}?\(\s*"?project_id"?\s*,\s*"?stack_order"?\s*\)/i)
  })
})

