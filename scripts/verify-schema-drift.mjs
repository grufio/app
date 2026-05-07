/**
 * Verify that `db/schema.sql` matches a fresh `supabase db dump` of the
 * linked production database.
 *
 * Drift means somebody pushed a migration to prod without regenerating
 * `db/schema.sql`, or — worse — someone hand-edited the schema. Either
 * way, the committed snapshot stops reflecting reality and every other
 * static check (lock-coverage, RLS verify, structural anchors) walks
 * over a stale ground.
 *
 * Run via `npm run verify:schema-drift`. Requires Docker (the supabase
 * CLI uses it for the dump). Skips with a soft warning when Docker /
 * supabase CLI are unavailable, so the script is safe to chain into
 * `gate:linked` without breaking dev environments that don't have them.
 *
 * Output: writes the fresh dump to a temp file, normalises both sides
 * (whitespace, comment lines), diffs them. Exits 1 on drift.
 */
import { execSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const root = process.cwd()
const committedPath = path.join(root, "db", "schema.sql")
if (!fs.existsSync(committedPath)) {
  console.error(`Missing ${committedPath}`)
  process.exit(1)
}

function softSkip(reason) {
  console.warn(`[verify-schema-drift] SKIPPED: ${reason}`)
  process.exit(0)
}

// Detect supabase CLI presence; otherwise skip softly.
try {
  execSync("supabase --version", { stdio: "ignore" })
} catch {
  softSkip("supabase CLI not on PATH")
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "schema-drift-"))
const freshPath = path.join(tmpDir, "schema.fresh.sql")

const dump = spawnSync("supabase", ["db", "dump", "--linked", "--schema", "public,storage"], {
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
})
if (dump.status !== 0) {
  // The most common failure here is "Docker not running". That's a soft
  // skip — devs without Docker shouldn't get a red gate over it.
  const stderr = dump.stderr ?? ""
  if (/docker/i.test(stderr)) softSkip("supabase CLI cannot reach Docker")
  console.error("[verify-schema-drift] supabase db dump failed:")
  console.error(stderr)
  process.exit(1)
}

fs.writeFileSync(freshPath, dump.stdout, "utf8")

// Normalise: drop comment-only lines and trailing whitespace before
// diffing so cosmetic version-banner changes don't trigger drift.
function normalise(sql) {
  return sql
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .filter((line) => !/^\s*--/.test(line))
    .filter((line) => line.length > 0)
    .join("\n")
}

const committed = normalise(fs.readFileSync(committedPath, "utf8"))
const fresh = normalise(dump.stdout)

if (committed === fresh) {
  console.log("OK: db/schema.sql matches a fresh dump from linked production.")
  process.exit(0)
}

// Show a short diff snippet — full diff is in tmp dir for inspection.
const committedLines = committed.split("\n")
const freshLines = fresh.split("\n")
const max = Math.max(committedLines.length, freshLines.length)
const diffSnippets = []
for (let i = 0; i < max && diffSnippets.length < 20; i++) {
  if (committedLines[i] !== freshLines[i]) {
    diffSnippets.push(`@@ line ${i + 1} @@`)
    if (committedLines[i] != null) diffSnippets.push(`- ${committedLines[i]}`)
    if (freshLines[i] != null) diffSnippets.push(`+ ${freshLines[i]}`)
  }
}

console.error("[verify-schema-drift] db/schema.sql diverged from a fresh dump.")
console.error("First differences (committed vs fresh):")
for (const line of diffSnippets) console.error(line)
console.error(`\nFull fresh dump kept at: ${freshPath}`)
console.error("Fix: run `npm run db:dump` and review the diff before committing.")
process.exit(1)
