/**
 * Bootstrap migration marker checker.
 *
 * Responsibilities:
 * - Ensure the Supabase bootstrap migration exists.
 * - Ensure bootstrap SQL still references the archived db/ migration blocks.
 */
import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const schemaPath = path.join(root, "db", "schema.sql")
const bootstrapPath = path.join(root, "supabase", "migrations", "20260129111414_bootstrap_from_db_folder.sql")

if (!fs.existsSync(bootstrapPath)) {
  console.error(`Missing ${bootstrapPath}`)
  process.exit(1)
}
if (!fs.existsSync(schemaPath)) {
  console.error(`Missing ${schemaPath}`)
  process.exit(1)
}

const bootstrap = fs.readFileSync(bootstrapPath, "utf8")
const sourceReferenceNeedles = [
  "db/001_init.sql",
]

const missingNeedles = sourceReferenceNeedles.filter((needle) => !bootstrap.includes(needle))
if (missingNeedles.length) {
  console.error("Bootstrap migration is missing expected schema workflow references:")
  for (const needle of missingNeedles) console.error(`- ${needle}`)
  console.error("\nFix: keep bootstrap migration aligned with the archived db/* block references.")
  process.exit(1)
}

console.log("OK: bootstrap migration sanity check passed.")
