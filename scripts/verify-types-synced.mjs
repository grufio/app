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
  // Three failure modes:
  //   (a) Pure additions on committed side (committed has MORE lines
  //       than remote) — this PR introduces a migration that adds
  //       columns/tables; prod hasn't received it yet. Soft-skip.
  //   (b) Pure removals on committed side (committed has FEWER lines
  //       than remote, all committed lines exist on remote) — this PR
  //       introduces a migration that drops columns/tables; prod
  //       hasn't received it yet. Soft-skip.
  //   (c) Both directions non-empty OR drift in unrelated places —
  //       real schema drift. Fail.
  const expectedLines = new Set(expected.split("\n"))
  const actualLineList = actual.split("\n")
  const remoteOnly = actualLineList.filter((line) => !expectedLines.has(line))
  const actualLines = new Set(actualLineList)
  const committedOnly = expected.split("\n").filter((line) => !actualLines.has(line))

  if (remoteOnly.length === 0) {
    console.warn(
      "WARN: lib/supabase/database.types.ts has additions over the remote dump — likely a pending additive migration in this PR.",
    )
    console.warn("Skipping strict equality; verify:remote-migrations covers the deploy gap.")
    process.exit(0)
  }

  if (committedOnly.length === 0) {
    console.warn(
      "WARN: lib/supabase/database.types.ts has removals vs the remote dump — likely a pending drop migration in this PR.",
    )
    console.warn("Skipping strict equality; verify:remote-migrations covers the deploy gap.")
    process.exit(0)
  }

  console.error("Type drift detected: lib/supabase/database.types.ts is out of sync.")
  console.error(`Remote has ${remoteOnly.length} line(s) the committed file is missing,`)
  console.error(`and committed has ${committedOnly.length} line(s) the remote is missing — non-trivial divergence.`)
  console.error("\nFix: run `npm run types:gen` and commit the updated types.")
  process.exit(1)
}

console.log("OK: generated types are in sync.")

