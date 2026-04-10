/**
 * DB schema marker checker.
 *
 * Responsibilities:
 * - Ensure `db/schema.sql` exists as a derived audit snapshot.
 * - Verify migration block marker integrity inside `db/schema.sql` (BEGIN/END count parity).
 * - Verify that critical canonical migration invariants are represented in the snapshot.
 */
import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const dbDir = path.join(root, "db")
const schemaPath = path.join(dbDir, "schema.sql")

if (!fs.existsSync(schemaPath)) {
  console.error(`Missing ${schemaPath}`)
  process.exit(1)
}

const schema = fs.readFileSync(schemaPath, "utf8")
const beginMarkers = schema.match(/--\s*BEGIN db\/.+\.sql/g) ?? []
const endMarkers = schema.match(/--\s*END db\/.+\.sql/g) ?? []

if (beginMarkers.length === 0) {
  console.error("db/schema.sql contains no migration BEGIN markers.")
  console.error("Fix: keep migration block markers in db/schema.sql for auditability.")
  process.exit(1)
}

if (beginMarkers.length !== endMarkers.length) {
  console.error("db/schema.sql has mismatched migration marker counts.")
  console.error(`BEGIN markers: ${beginMarkers.length}`)
  console.error(`END markers:   ${endMarkers.length}`)
  console.error("Fix: ensure every BEGIN marker has a matching END marker in db/schema.sql.")
  process.exit(1)
}

const invariantChecks = [
  {
    name: "project_image_state canonical µpx size is NOT NULL",
    pattern:
      /alter table public\.project_image_state\s+alter column width_px_u set not null,\s+alter column height_px_u set not null;/m,
  },
  {
    name: "project_grid spacing_x/spacing_y is NOT NULL",
    pattern:
      /alter table public\.project_grid\s+alter column spacing_x_value set not null,\s+alter column spacing_y_value set not null;/m,
  },
  {
    name: "project_grid legacy sync trigger function exists",
    pattern: /create or replace function public\.project_grid_sync_spacing_legacy\(\)/m,
  },
  {
    name: "project_images kind enum exists",
    pattern: /create type public\.image_kind as enum \('master', 'working_copy', 'filter_working_copy'\)/m,
  },
]

const missingInvariants = invariantChecks.filter(({ pattern }) => !pattern.test(schema))
if (missingInvariants.length) {
  console.error("db/schema.sql is missing critical canonical migration invariants:")
  for (const inv of missingInvariants) console.error(`- ${inv.name}`)
  console.error("\nFix: regenerate or patch db/schema.sql from canonical supabase migrations.")
  process.exit(1)
}

console.log(`OK: db/schema.sql marker/invariant integrity passed (${beginMarkers.length} migration blocks).`)

