/**
 * Offline guard: a Supabase migration must not land without a regenerated
 * `lib/supabase/database.types.ts`. Catches the schema-drift bug class
 * without requiring Supabase auth (works on fork PRs, in CI, locally).
 *
 * Resolves the diff base in this order:
 * 1. `CI_DIFF_BASE` env (explicit override)
 * 2. `GITHUB_BASE_REF` (PR target branch — origin/<ref>) on a GitHub PR run
 * 3. `GITHUB_EVENT_BEFORE` on a push event
 * 4. `git merge-base origin/main HEAD` for local runs
 *
 * If no base can be resolved (shallow clone, detached worktree, etc.),
 * skips with a warning rather than failing — the strict pre-release gate
 * (`verify:types-synced`) is the backstop.
 */
import { spawnSync } from "node:child_process"
import fs from "node:fs"

const TYPES_FILE = "lib/supabase/database.types.ts"
const MIGRATIONS_DIR = "supabase/migrations/"
// Migrations whose first 50 lines contain this marker are treated as
// pure backfills of state that prod already has — committed types
// (regenerated from prod) remain accurate, so a types-regen is not
// required for this PR. Used for "close-drift" / "align-to-prod" style
// migrations whose every statement is idempotent and a no-op on prod.
const BACKFILL_MARKER = "@intent-backfill-migration"

function git(args) {
  const res = spawnSync("git", args, { encoding: "utf8" })
  if (res.error) return { ok: false, err: res.error.message }
  if (res.status !== 0) return { ok: false, err: (res.stderr ?? "").trim() }
  return { ok: true, out: (res.stdout ?? "").trim() }
}

function resolveBase() {
  const override = (process.env.CI_DIFF_BASE ?? "").trim()
  if (override) return { ref: override, source: "CI_DIFF_BASE" }

  const baseRef = (process.env.GITHUB_BASE_REF ?? "").trim()
  if (baseRef) {
    const ref = `origin/${baseRef}`
    const r = git(["rev-parse", "--verify", ref])
    if (r.ok) return { ref, source: "GITHUB_BASE_REF" }
  }

  const before = (process.env.GITHUB_EVENT_BEFORE ?? "").trim()
  if (before && !/^0+$/.test(before)) {
    const r = git(["rev-parse", "--verify", before])
    if (r.ok) return { ref: before, source: "GITHUB_EVENT_BEFORE" }
  }

  const mergeBase = git(["merge-base", "origin/main", "HEAD"])
  if (mergeBase.ok && mergeBase.out) return { ref: mergeBase.out, source: "merge-base origin/main" }

  return null
}

const base = resolveBase()
if (!base) {
  console.log("SKIP: cannot resolve diff base (no origin/main, no CI vars). Pre-release gate covers this case.")
  process.exit(0)
}

const diff = git(["diff", "--name-status", `${base.ref}...HEAD`])
if (!diff.ok) {
  console.log(`SKIP: git diff against ${base.ref} failed: ${diff.err}`)
  process.exit(0)
}

const lines = diff.out.split("\n").map(s => s.trim()).filter(Boolean)
const entries = lines.map((line) => {
  const [status, ...rest] = line.split(/\s+/)
  return { status, path: rest[rest.length - 1] }
})

const changed = entries.map((e) => e.path)
const migrationEntries = entries.filter((e) => e.path.startsWith(MIGRATIONS_DIR) && e.path.endsWith(".sql"))
const migrationsAdded = migrationEntries.filter((e) => e.status === "A")
const migrationsModified = migrationEntries.filter((e) => e.status === "M")
const migrationsDeleted = migrationEntries.filter((e) => e.status === "D")
const typesTouched = changed.includes(TYPES_FILE)

if (migrationEntries.length === 0) {
  console.log(`OK: no migrations changed since ${base.source} (${base.ref}).`)
  process.exit(0)
}

if (typesTouched) {
  console.log(`OK: ${migrationEntries.length} migration(s) changed and ${TYPES_FILE} was updated.`)
  process.exit(0)
}

// Squash heuristic: many deletions plus at most one modification (the latest
// migration file is the conventional landing spot for `supabase migration
// squash` output) and no additions means the change is a refactor of the
// migration history, not a new schema delta. Types regeneration would produce
// no diff in that case, so requiring `typesTouched` would be a false positive.
if (migrationsAdded.length === 0 && migrationsModified.length <= 1 && migrationsDeleted.length > 0) {
  console.log(
    `OK: ${migrationsDeleted.length} deleted + ${migrationsModified.length} modified migration(s), no additions — looks like a squash, types regen produces no semantic diff.`
  )
  process.exit(0)
}

// Backfill-marker heuristic: migrations whose first 50 lines contain the
// `@intent-backfill-migration` marker declare themselves no-ops on prod
// (prod already has the state; the migration just brings local migration
// intent into alignment). Committed types remain accurate because they
// were regenerated from prod. Skip the require-types-touched gate for
// these migrations.
const addedAndModified = [...migrationsAdded, ...migrationsModified]
if (addedAndModified.length > 0) {
  const markerHits = addedAndModified.filter((e) => {
    try {
      const content = fs.readFileSync(e.path, "utf8")
      const head = content.split("\n").slice(0, 50).join("\n")
      return head.includes(BACKFILL_MARKER)
    } catch {
      return false
    }
  })
  if (markerHits.length === addedAndModified.length) {
    const names = markerHits.map((e) => e.path).join(", ")
    console.log(
      `OK: every changed migration carries ${BACKFILL_MARKER} (${names}) — committed types reflect prod, regen not required.`
    )
    process.exit(0)
  }
}

console.error("Schema drift risk: migration(s) changed but database.types.ts was not regenerated.")
console.error("\nChanged migrations:")
for (const e of migrationEntries) console.error(`  ${e.status}  ${e.path}`)
console.error(`\nFix: run \`npm run types:gen\` and commit ${TYPES_FILE}.`)
console.error(`(Diff base: ${base.source} → ${base.ref})`)
process.exit(1)
