/**
 * DB schema marker checker.
 *
 * Responsibilities:
 * - Ensure `db/schema.sql` exists and remains the single active DB source file.
 * - Verify migration block marker integrity inside `db/schema.sql` (BEGIN/END count parity).
 * - Used by CI to prevent schema drift.
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

console.log(`OK: db/schema.sql single-source integrity passed (${beginMarkers.length} migration blocks).`)

