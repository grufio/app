/**
 * Bootstrap migration marker checker.
 *
 * Responsibilities:
 * - Ensure every `db/0xx_*.sql` migration is represented in the Supabase bootstrap migration.
 * - Prevent drift between numbered db migrations and CLI bootstrap SQL.
 */
import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const dbDir = path.join(root, "db")
const bootstrapPath = path.join(root, "supabase", "migrations", "20260129111414_bootstrap_from_db_folder.sql")

if (!fs.existsSync(bootstrapPath)) {
  console.error(`Missing ${bootstrapPath}`)
  process.exit(1)
}

const bootstrap = fs.readFileSync(bootstrapPath, "utf8")
const migrationFiles = fs
  .readdirSync(dbDir)
  .filter((f) => /^0\d{2}_.+\.sql$/.test(f) && f !== "schema.sql")
  .sort()

const missing = []
for (const f of migrationFiles) {
  const marker = `db/${f}`
  if (!bootstrap.includes(marker)) missing.push(f)
}

if (missing.length) {
  console.error("Bootstrap migration is missing the following db migration markers:")
  for (const f of missing) console.error(`- ${f}`)
  console.error("\nFix: sync supabase bootstrap migration with db/0xx files.")
  process.exit(1)
}

console.log(`OK: bootstrap migration contains ${migrationFiles.length}/${migrationFiles.length} db migration markers.`)
