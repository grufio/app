/**
 * Enforce that `createSupabaseServiceRoleClient()` is only invoked from an
 * explicit allowlist. The service-role key bypasses RLS, so every new caller
 * is a security-relevant decision and must be reviewed.
 *
 * Convention (see lib/supabase/service-role.ts): service-role is only for
 * storage cleanup after soft-delete (the owner client cannot remove storage
 * objects of soft-deleted images, since RLS hides the row).
 *
 * Failure mode this catches: a developer reaches for service-role to "make
 * a query work" and silently disables the ownership boundary across the app.
 */
import fs from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const NEEDLE = "createSupabaseServiceRoleClient("

const ALLOWLIST = new Set([
  "lib/supabase/service-role.ts", // the definition itself
  "services/editor/server/filter-variants.ts", // delegates storage cleanup after soft-delete
  "services/editor/server/filter-working-copy.ts", // soft-delete + sync storage cleanup of working copies
  "services/editor/server/filter-chain-reset.ts", // soft-delete + sync storage cleanup of chain outputs
])

// Scan production code only — scripts/, e2e/, tests are tooling.
const SCAN_DIRS = ["app", "lib", "services", "features", "components"]

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walk(full)
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      yield full
    }
  }
}

const offenders = []
for (const dir of SCAN_DIRS) {
  const abs = path.join(ROOT, dir)
  if (!fs.existsSync(abs)) continue
  for (const file of walk(abs)) {
    const rel = path.relative(ROOT, file)
    if (ALLOWLIST.has(rel)) continue
    const content = fs.readFileSync(file, "utf8")
    if (content.includes(NEEDLE)) offenders.push(rel)
  }
}

if (offenders.length > 0) {
  console.error("Service-role usage outside the allowlist:")
  for (const f of offenders) console.error(`  - ${f}`)
  console.error("\nIf this call really needs to bypass RLS, add the file to ALLOWLIST in")
  console.error("scripts/verify-service-role-usage.mjs after a security review. Otherwise,")
  console.error("switch to the regular supabase client with proper RLS policies.")
  process.exit(1)
}

// Soft cap: the allowlist is meant to be small. Past five entries it stops
// being a curated exception list and starts being "yet another permission
// surface". Warn loud (CI annotation when running on GitHub Actions) so the
// reviewer at least sees the trend.
const SOFT_CAP = 5
if (ALLOWLIST.size > SOFT_CAP) {
  const msg =
    `Service-role allowlist now has ${ALLOWLIST.size} entries (soft cap ${SOFT_CAP}). ` +
    `Re-evaluate whether the boundary is still meaningful — consider extracting a single ` +
    `cleanup-orchestrator helper, or splitting service-role usage into a smaller, named API.`
  if (process.env.GITHUB_ACTIONS === "true") {
    process.stdout.write(`::warning title=Service-role allowlist exceeds soft cap::${msg}\n`)
  }
  console.warn(`[verify-service-role-usage] WARN: ${msg}`)
}

console.log(`OK: service-role usage limited to ${ALLOWLIST.size} allowlisted file(s).`)
