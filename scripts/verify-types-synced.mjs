/**
 * Verify generated DB types are in sync (optional).
 *
 * Responsibilities:
 * - In CI, optionally verify that `lib/supabase/database.types.ts` matches the output of
 *   `supabase gen types` for the linked project.
 *
 * Behavior:
 * - If `SUPABASE_VERIFY_TYPES_SYNC != "1"`, exits 0 (skipped).
 * - If generation fails (missing auth/link), exits 1 with actionable message.
 */
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { spawnSync } from "node:child_process"

const root = process.cwd()
const enabled = (process.env.SUPABASE_VERIFY_TYPES_SYNC ?? "").trim() === "1"
if (!enabled) {
  console.log("SKIP: SUPABASE_VERIFY_TYPES_SYNC not set to 1.")
  process.exit(0)
}

const outPath = path.join(root, "lib", "supabase", "database.types.ts")
if (!fs.existsSync(outPath)) {
  console.error(`Missing ${outPath}`)
  process.exit(1)
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gruf-types-"))
const tmpFile = path.join(tmpDir, "database.types.ts")

// Use Supabase CLI (requires `supabase link` in repo and auth in CI).
const args = ["gen", "types", "typescript", "--linked", "--schema", "public"]

const cliArgs = ["-y", "supabase@2.98.2", ...args]
const res = spawnSync("npx", cliArgs, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
if (res.error || res.status !== 0) {
  console.error("Failed to generate types via Supabase CLI (npx supabase@2.98.2).")
  if (res.stderr) console.error(res.stderr.trim())
  console.error("\nTip: ensure the project is linked and CI has required auth (SUPABASE_DB_PASSWORD or access token).")
  process.exit(1)
}

fs.writeFileSync(tmpFile, res.stdout ?? "", "utf8")

const expected = fs.readFileSync(outPath, "utf8").replace(/\r\n/g, "\n")
const actual = fs.readFileSync(tmpFile, "utf8").replace(/\r\n/g, "\n")

if (expected !== actual) {
  // Distinguish two failure modes:
  //   (a) committed types have *fewer* lines than remote — committed is
  //       stale (someone changed the schema on prod without checking
  //       in the regenerated types). Real drift; fail.
  //   (b) committed types have *more* lines than remote — this PR
  //       introduces a migration that hasn't been deployed yet, so
  //       prod-generated types can't include the new tables/columns.
  //       Soft-skip with WARN; the deploy workflow + the next PR's
  //       run will enforce sync once prod catches up.
  // Heuristic: split into line sets and compare. If every line in
  // `actual` (remote) also appears in `expected` (committed), the
  // diff is pure additions on the committed side → likely pending.
  const expectedLines = new Set(expected.split("\n"))
  const actualLines = actual.split("\n")
  const remoteOnly = actualLines.filter((line) => !expectedLines.has(line))

  if (remoteOnly.length === 0) {
    console.warn(
      "WARN: lib/supabase/database.types.ts has additions over the remote dump — likely a pending migration in this PR.",
    )
    console.warn("Skipping strict equality; verify:remote-migrations covers the deploy gap.")
    process.exit(0)
  }

  console.error("Type drift detected: lib/supabase/database.types.ts is out of sync.")
  console.error(`Remote has ${remoteOnly.length} line(s) the committed file is missing — committed is stale.`)
  console.error("\nFix: run `npm run types:gen` and commit the updated types.")
  process.exit(1)
}

console.log("OK: generated types are in sync.")

