/**
 * DB schema marker checker.
 *
 * Responsibilities:
 * - Ensure every `db/0xx_*.sql` migration is embedded in `db/schema.sql` with matching BEGIN/END markers.
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

const migrationFiles = fs
  .readdirSync(dbDir)
  .filter((f) => /^0\d{2}_.+\.sql$/.test(f) && f !== "schema.sql")
  .sort()

const missing = []
for (const f of migrationFiles) {
  const marker = `BEGIN db/${f}`
  if (!schema.includes(marker)) missing.push(f)
}

if (missing.length) {
  console.error("db/schema.sql is missing the following migration markers:")
  for (const f of missing) console.error(`- ${f}`)
  console.error("\nFix: paste the migration contents into db/schema.sql with matching BEGIN/END markers.")
  process.exit(1)
}

console.log(`OK: db/schema.sql contains ${migrationFiles.length}/${migrationFiles.length} migration markers.`)

