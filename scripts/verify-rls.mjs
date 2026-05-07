/**
 * RLS + Supabase safety verification.
 *
 * Responsibilities:
 * - Fail fast if critical tables are missing RLS enablement in `db/schema.sql`.
 * - Fail fast if critical tables are missing owner-only policies (FOR ALL or
 *   CRUD coverage).
 * - Verify Storage policies for `project_images` bucket exist in schema (RLS
 *   on `storage.objects`).
 * - Guardrail: ensure no `service_role` env vars are referenced in runtime
 *   code.
 *
 * Notes:
 * - This is a static verification script. It does NOT apply migrations or
 *   modify remote state.
 * - As of 2026-05-07 `db/schema.sql` is a `pg_dump` snapshot — uppercase DDL
 *   with quoted identifiers (`ALTER TABLE "public"."x" ENABLE ROW LEVEL
 *   SECURITY;`). Pattern matchers below tolerate either format so the script
 *   stays useful for hand-edited test fixtures too.
 * - Storage DDL may require applying in Supabase SQL editor depending on
 *   ownership/privileges.
 */
import fs from "node:fs"
import path from "node:path"

import { RLS_PROTECTED_TABLES } from "./_rls-tables.mjs"

const root = process.cwd()

function fail(message) {
  console.error(message)
  process.exit(1)
}

function readText(filePath) {
  if (!fs.existsSync(filePath)) fail(`Missing ${filePath}`)
  return fs.readFileSync(filePath, "utf8")
}

// Pattern matchers tolerate either `pg_dump` form
// (`ALTER TABLE "public"."x" ENABLE ROW LEVEL SECURITY;`) or plain form
// (`alter table public.x enable row level security;`). Identifiers are
// matched optionally-quoted; whitespace and case are flexible.
function rxRlsEnable(table) {
  return new RegExp(
    `ALTER\\s+TABLE\\s+"?public"?\\."?${table}"?\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
    "i",
  )
}

function rxPolicyOn(table, op) {
  // Pattern: ON "public"."<table>" FOR <OP>  OR  on public.<table> for <op>
  return new RegExp(
    `ON\\s+"?public"?\\."?${table}"?[\\s\\S]{0,80}?FOR\\s+${op}\\b`,
    "i",
  )
}

function rxPolicyAllOps(table) {
  // FOR ALL is rare; pg_dump usually splits to four CRUD policies. Keep
  // matcher in case a hand-written FOR ALL slips back.
  return new RegExp(
    `ON\\s+"?public"?\\."?${table}"?[\\s\\S]{0,80}?FOR\\s+ALL\\b`,
    "i",
  )
}

function hasAuthUidNearPolicy(schema, table) {
  // Find a CREATE POLICY block on this table and verify auth.uid() appears
  // inside it. Anchoring at `CREATE POLICY` avoids false hits on
  // `CREATE INDEX … ON "public"."<table>"` and similar non-policy DDL.
  const re = new RegExp(
    `CREATE\\s+POLICY\\s+"[^"]+"\\s+ON\\s+"?public"?\\."?${table}"?[\\s\\S]{0,1500}`,
    "i",
  )
  const m = re.exec(schema)
  if (!m) return false
  return /auth"?\."?uid"?\s*\(\s*\)/i.test(m[0])
}

function verifyPublicTable(schema, table) {
  if (!rxRlsEnable(table).test(schema)) {
    fail(`RLS missing: expected ENABLE ROW LEVEL SECURITY for public.${table} in db/schema.sql`)
  }

  if (rxPolicyAllOps(table).test(schema)) {
    if (!hasAuthUidNearPolicy(schema, table)) {
      fail(`Policy missing auth.uid(): expected owner-only condition near "FOR ALL" on public.${table}`)
    }
    return
  }

  const ops = ["SELECT", "INSERT", "UPDATE", "DELETE"]
  const missingOps = ops.filter((op) => !rxPolicyOn(table, op).test(schema))
  if (missingOps.length > 0) {
    fail(
      `Policies missing for public.${table}: expected FOR ALL or full CRUD coverage (missing ${missingOps.join(", ")})`,
    )
  }

  if (!hasAuthUidNearPolicy(schema, table)) {
    fail(`Policies look incomplete on public.${table}: expected auth.uid() in policy USING/WITH CHECK`)
  }
}

function rxStorageRlsEnable() {
  return new RegExp(
    `ALTER\\s+TABLE\\s+"?storage"?\\."?objects"?\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
    "i",
  )
}

function rxStoragePolicyForOp(op) {
  return new RegExp(
    `ON\\s+"?storage"?\\."?objects"?[\\s\\S]{0,80}?FOR\\s+${op}\\b`,
    "i",
  )
}

function hasAuthUidNearStorageSelect(schema) {
  const m = /ON\s+"?storage"?\."?objects"?[\s\S]{0,80}?FOR\s+SELECT\b/i.exec(schema)
  if (!m) return false
  const window = schema.slice(m.index, m.index + 1500)
  return /auth"?\."?uid"?\s*\(\s*\)/i.test(window)
}

function verifyStoragePolicies(schema) {
  if (!rxStorageRlsEnable().test(schema)) {
    fail("Storage RLS missing: expected ENABLE ROW LEVEL SECURITY on storage.objects in db/schema.sql")
  }

  for (const op of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
    if (!rxStoragePolicyForOp(op).test(schema)) {
      fail(`Storage policies missing: expected FOR ${op} on storage.objects in db/schema.sql`)
    }
  }

  if (!hasAuthUidNearStorageSelect(schema)) {
    fail("Storage policies look incomplete: expected auth.uid() in storage.objects FOR SELECT policy")
  }

  // Bucket restriction (project_images). Match either bare or quoted form.
  if (!/(?:"?bucket_id"?\s*=\s*'project_images')/i.test(schema)) {
    fail("Storage policies look incomplete: expected bucket_id = 'project_images' in db/schema.sql")
  }
}

function walk(dir) {
  /** @type {string[]} */
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".next" || ent.name === ".git") continue
      out.push(...walk(full))
    } else {
      out.push(full)
    }
  }
  return out
}

function verifyNoServiceRoleEnvUsage() {
  const forbiddenEnvReads = [
    /process\.env\.SUPABASE_SERVICE_ROLE_KEY/g,
    /process\.env\.SUPABASE_SERVICE_KEY/g,
    /process\.env\.SUPABASE_SECRET_KEY/g,
  ]

  const roots = ["app", "components", "features", "lib", "services", "hooks"].map((p) => path.join(root, p))
  const files = roots.flatMap(walk).filter((p) => /\.(ts|tsx|js|mjs)$/.test(p))

  const hits = []
  for (const filePath of files) {
    const text = readText(filePath)
    for (const rx of forbiddenEnvReads) {
      if (rx.test(text)) {
        if (filePath.endsWith(path.join("lib", "supabase", "service-role.ts"))) continue
        hits.push({ filePath, match: rx.toString() })
      }
      rx.lastIndex = 0
    }
  }

  if (hits.length) {
    console.error("Forbidden service-role env usage detected:")
    for (const h of hits) console.error(`- ${h.filePath} (${h.match})`)
    fail("\nFix: never use service_role keys in runtime code. Use anon + user JWT with RLS instead.")
  }
}

function main() {
  const schemaPath = path.join(root, "db", "schema.sql")
  const schema = readText(schemaPath)

  for (const table of RLS_PROTECTED_TABLES) verifyPublicTable(schema, table)
  verifyStoragePolicies(schema)
  verifyNoServiceRoleEnvUsage()

  console.log(`OK: RLS + policy checks passed for ${RLS_PROTECTED_TABLES.length} tables + storage.objects.`)
}

main()
