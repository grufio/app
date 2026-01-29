/**
 * Verify remote migrations are applied (Supabase CLI-first).
 *
 * Responsibilities:
 * - Compare local canonical migrations (`supabase/migrations/*.sql`) with remote applied migrations
 *   via `supabase migration list --linked --output json`.
 * - Optionally compare legacy/manual migration tracking (`db/0xx_*.sql`) against
 *   `public.schema_migrations` (if `psql` + `SUPABASE_DB_URL` are available).
 *
 * Exit codes:
 * - 0: OK (no missing canonical migrations on remote).
 * - 1: Missing canonical migrations OR remote has unknown migrations not present locally.
 *
 * Notes:
 * - This script is designed as a release gate: it should be deterministic and actionable.
 * - It intentionally does not attempt to modify the database.
 */
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"

const root = process.cwd()

function listLocalSupabaseMigrations() {
  const dir = path.join(root, "supabase", "migrations")
  if (!fs.existsSync(dir)) return []
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d{14}_.+\.sql$/.test(f))
    .sort()
  return files.map((f) => f.replace(/\.sql$/, ""))
}

function listLocalDbMigrations() {
  const dir = path.join(root, "db")
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => /^0\d{2}_.+\.sql$/.test(f) && f !== "schema.sql")
    .sort()
}

function extractMigrationNamesFromJson(value, out) {
  if (typeof value === "string") {
    const s = value.trim()
    const base = s.endsWith(".sql") ? s.slice(0, -4) : s
    if (/^\d{14}_.+/.test(base)) out.add(base)
    return
  }
  if (Array.isArray(value)) {
    for (const v of value) extractMigrationNamesFromJson(v, out)
    return
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) extractMigrationNamesFromJson(v, out)
  }
}

function runSupabaseMigrationListJson() {
  const args = ["migration", "list", "--linked", "--output", "json"]
  const pw = (process.env.SUPABASE_DB_PASSWORD ?? process.env.SUPABASE_DB_PASS ?? "").trim()
  if (pw) args.push("--password", pw)

  const res = spawnSync("supabase", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
  if (res.error) {
    return {
      ok: false,
      reason: `Failed to execute Supabase CLI: ${String(res.error.message ?? res.error)}`,
      stdout: res.stdout ?? "",
      stderr: res.stderr ?? "",
    }
  }
  if (res.status !== 0) {
    return {
      ok: false,
      reason: `Supabase CLI exited with ${res.status}`,
      stdout: res.stdout ?? "",
      stderr: res.stderr ?? "",
    }
  }
  let parsed = null
  try {
    parsed = JSON.parse(res.stdout)
  } catch {
    return {
      ok: false,
      reason: "Supabase CLI did not return valid JSON (try upgrading Supabase CLI)",
      stdout: res.stdout ?? "",
      stderr: res.stderr ?? "",
    }
  }
  return { ok: true, value: parsed, stdout: res.stdout ?? "", stderr: res.stderr ?? "" }
}

function maybeFetchPublicSchemaMigrationsViaPsql() {
  const dbUrl = process.env.SUPABASE_DB_URL?.trim()
  if (!dbUrl) return { ok: false, reason: "SUPABASE_DB_URL not set" }

  const res = spawnSync(
    "psql",
    [
      dbUrl,
      "-X",
      "-A",
      "-t",
      "-c",
      "select filename from public.schema_migrations order by filename;",
    ],
    {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }
  )

  if (res.error) return { ok: false, reason: `psql not available: ${String(res.error.message ?? res.error)}` }
  if (res.status !== 0) {
    // Table may legitimately not exist (optional tracking).
    return { ok: false, reason: (res.stderr ?? "").trim() || `psql exited with ${res.status}` }
  }

  const lines = (res.stdout ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)

  return { ok: true, filenames: lines }
}

function setDiff(a, b) {
  const out = []
  for (const x of a) if (!b.has(x)) out.push(x)
  return out
}

const localCanonical = listLocalSupabaseMigrations()
if (!localCanonical.length) {
  console.error("No canonical migrations found at supabase/migrations/*.sql")
  process.exit(1)
}

const remoteRes = runSupabaseMigrationListJson()
if (!remoteRes.ok) {
  console.error("Failed to list remote migrations via Supabase CLI.")
  console.error(`Reason: ${remoteRes.reason}`)
  if (remoteRes.stderr) console.error(remoteRes.stderr.trim())
  console.error(
    "\nTip: run `supabase link --password \"$SUPABASE_DB_PASSWORD\"` once, or set SUPABASE_DB_PASSWORD for non-interactive CI/local checks."
  )
  process.exit(1)
}

const remoteApplied = new Set()
extractMigrationNamesFromJson(remoteRes.value, remoteApplied)

const localSet = new Set(localCanonical)
const missingOnRemote = setDiff(localSet, remoteApplied)
const unknownOnRemote = setDiff(remoteApplied, localSet)

if (missingOnRemote.length) {
  console.error("Remote is missing canonical migrations:")
  for (const name of missingOnRemote.sort()) console.error(`- ${name}.sql`)
  console.error("\nFix: apply pending migrations to the linked project:")
  console.error("  supabase db push --linked")
}

if (unknownOnRemote.length) {
  console.error("Remote contains migrations not present locally:")
  for (const name of unknownOnRemote.sort()) console.error(`- ${name}.sql`)
  console.error("\nFix: align repo to remote (example):")
  console.error("  supabase db pull --linked")
}

// Optional legacy/manual tracking check (non-blocking by default).
const legacyDbFiles = listLocalDbMigrations()
const psqlRes = maybeFetchPublicSchemaMigrationsViaPsql()
if (psqlRes.ok) {
  const tracked = new Set(psqlRes.filenames)
  const missingLegacyTrack = legacyDbFiles.filter((f) => !tracked.has(`db/${f}`) && !tracked.has(f))
  if (missingLegacyTrack.length) {
    console.warn("\nWarning: public.schema_migrations is missing entries for some db/ migrations:")
    for (const f of missingLegacyTrack) console.warn(`- db/${f}`)
    console.warn("This is optional tracking; consider recording applied SQL editor runs for auditability.")
  }
} else {
  // Silent-ish: it's explicitly optional.
  console.log(`Note: skipping public.schema_migrations check (${psqlRes.reason}).`)
}

if (missingOnRemote.length || unknownOnRemote.length) process.exit(1)

console.log(`OK: remote matches local canonical migrations (${localCanonical.length}).`)

