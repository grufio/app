/**
 * DB schema sanity checker for `db/schema.sql`.
 *
 * As of 2026-05-07 the schema is a consolidated `pg_dump` of the production
 * `public` schema (regenerated via `npm run db:dump`), not the previous
 * stack of layered migration blocks. This script enforces:
 *
 * 1. The file exists and is non-empty.
 * 2. Each Postgres function is defined at most once (no leftover historical
 *    `CREATE OR REPLACE FUNCTION` duplicates from the old stacked snapshot).
 * 3. A few canonical structural anchors are present (RLS on `project_images`,
 *    the `image_kind` enum, the master-immutability trigger function), so a
 *    botched re-dump can't silently slip through.
 *
 * The deeper "schema matches production" check lives in `verify:schema-drift`
 * (separate script, requires Docker / SUPABASE_DB_URL) — it pulls a fresh
 * dump and diffs against the committed file.
 */
import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const schemaPath = path.join(root, "db", "schema.sql")

if (!fs.existsSync(schemaPath)) {
  console.error(`Missing ${schemaPath}`)
  process.exit(1)
}

const schema = fs.readFileSync(schemaPath, "utf8")

if (schema.trim().length < 1000) {
  console.error("db/schema.sql is suspiciously small (<1000 chars). Likely a botched dump.")
  process.exit(1)
}

// 2. No duplicate function definitions.
//
// pg_dump emits `CREATE OR REPLACE FUNCTION "public"."<name>"(<sig>)`. Group
// by canonical name + parameter signature (raw between parens) so true
// overloads remain distinct but historical re-creates of the same signature
// are caught.
const functionLineRe = /^CREATE\s+OR\s+REPLACE\s+FUNCTION\s+"public"\."([^"]+)"\s*\(([^)]*)\)/gm
const functionCounts = new Map()
for (const m of schema.matchAll(functionLineRe)) {
  const name = m[1]
  const sig = m[2].replace(/\s+/g, " ").trim()
  const key = `${name}(${sig})`
  functionCounts.set(key, (functionCounts.get(key) ?? 0) + 1)
}

const duplicates = [...functionCounts.entries()].filter(([, count]) => count > 1)
if (duplicates.length > 0) {
  console.error("db/schema.sql contains duplicate function definitions:")
  for (const [key, count] of duplicates) console.error(`  ${count}× ${key}`)
  console.error(
    "\nFix: regenerate via `npm run db:dump` (preferred) or remove the older copies by hand.\n" +
      "The old stacked-migration format is dead; only the latest body should appear."
  )
  process.exit(1)
}

// 3. Canonical structural anchors. Case-insensitive + quote-tolerant so the
//    check survives both pg_dump output and a hypothetical hand-edited copy.
const anchors = [
  {
    name: "project_images table exists",
    re: /CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?"?public"?\."?project_images"?\s*\(/i,
  },
  {
    name: "image_kind enum exists with master/working_copy/filter_working_copy",
    re: /CREATE\s+TYPE\s+"?public"?\."?image_kind"?\s+AS\s+ENUM[\s\S]*?master[\s\S]*?working_copy[\s\S]*?filter_working_copy/i,
  },
  {
    name: "guard_master_immutable trigger function exists",
    re: /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+"?public"?\."?guard_master_immutable"?/i,
  },
  {
    name: "RLS enabled on project_images",
    re: /ALTER\s+TABLE\s+"?public"?\."?project_images"?\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,
  },
]

const missing = anchors.filter((a) => !a.re.test(schema))
if (missing.length > 0) {
  console.error("db/schema.sql is missing canonical structural anchors:")
  for (const a of missing) console.error(`- ${a.name}`)
  console.error("\nFix: regenerate via `npm run db:dump`.")
  process.exit(1)
}

const fnCount = [...functionCounts.keys()].length
console.log(
  `OK: db/schema.sql sanity passed (${fnCount} unique functions, ${schema.length.toLocaleString()} bytes).`
)
