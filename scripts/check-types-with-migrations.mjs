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

const TYPES_FILE = "lib/supabase/database.types.ts"
const MIGRATIONS_DIR = "supabase/migrations/"

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

const diff = git(["diff", "--name-only", `${base.ref}...HEAD`])
if (!diff.ok) {
  console.log(`SKIP: git diff against ${base.ref} failed: ${diff.err}`)
  process.exit(0)
}

const changed = diff.out.split("\n").map(s => s.trim()).filter(Boolean)
const migrationChanges = changed.filter(p => p.startsWith(MIGRATIONS_DIR) && p.endsWith(".sql"))
const typesTouched = changed.includes(TYPES_FILE)

if (migrationChanges.length === 0) {
  console.log(`OK: no migrations changed since ${base.source} (${base.ref}).`)
  process.exit(0)
}

if (typesTouched) {
  console.log(`OK: ${migrationChanges.length} migration(s) changed and ${TYPES_FILE} was updated.`)
  process.exit(0)
}

console.error("Schema drift risk: migration(s) changed but database.types.ts was not regenerated.")
console.error("\nChanged migrations:")
for (const p of migrationChanges) console.error(`  - ${p}`)
console.error(`\nFix: run \`npm run types:gen\` and commit ${TYPES_FILE}.`)
console.error(`(Diff base: ${base.source} → ${base.ref})`)
process.exit(1)
