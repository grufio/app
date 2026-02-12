/**
 * RLS + Supabase safety verification.
 *
 * Responsibilities:
 * - Fail fast if critical tables are missing RLS enablement in `db/schema.sql`.
 * - Fail fast if critical tables are missing owner-only policies (FOR ALL or CRUD coverage).
 * - Verify Storage policies for `project_images` bucket exist in schema (RLS on `storage.objects`).
 * - Guardrail: ensure no `service_role` env vars are referenced in runtime code.
 *
 * Notes:
 * - This is a static verification script. It does NOT apply migrations or modify remote state.
 * - Storage DDL may require applying in Supabase SQL editor depending on ownership/privileges.
 */
import fs from "node:fs"
import path from "node:path"

const root = process.cwd()

function fail(message) {
  console.error(message)
  process.exit(1)
}

function readText(filePath) {
  if (!fs.existsSync(filePath)) fail(`Missing ${filePath}`)
  return fs.readFileSync(filePath, "utf8")
}

function hasAllOpsPolicy(schema, table) {
  return schema.includes(`on public.${table} for all`)
}

function hasCrudPolicies(schema, table) {
  const ops = ["select", "insert", "update", "delete"]
  return ops.every((op) => schema.includes(`on public.${table} for ${op}`))
}

function hasAuthUidNearPolicy(schema, needle) {
  const idx = schema.indexOf(needle)
  if (idx < 0) return false
  const window = schema.slice(idx, idx + 1200) // typical policy blocks are small
  return window.includes("auth.uid()")
}

function verifyPublicTable(schema, table) {
  const rlsNeedle = `alter table public.${table} enable row level security;`
  if (!schema.includes(rlsNeedle)) {
    fail(`RLS missing: expected in db/schema.sql -> ${rlsNeedle}`)
  }

  if (hasAllOpsPolicy(schema, table)) {
    const needle = `on public.${table} for all`
    if (!hasAuthUidNearPolicy(schema, needle)) {
      fail(`Policy missing auth.uid(): expected owner-only condition near "${needle}"`)
    }
    return
  }

  if (!hasCrudPolicies(schema, table)) {
    fail(`Policies missing: expected FOR ALL or CRUD policies for public.${table}`)
  }

  // If CRUD policies are used, require auth.uid() nearby at least for one op.
  const anyNeedle = ["select", "insert", "update", "delete"]
    .map((op) => `on public.${table} for ${op}`)
    .find((n) => schema.includes(n))
  if (anyNeedle && !hasAuthUidNearPolicy(schema, anyNeedle)) {
    fail(`Policies look incomplete: expected auth.uid() near "${anyNeedle}"`)
  }
}

function verifyStoragePolicies(schema) {
  const rlsNeedle = "alter table storage.objects enable row level security;"
  if (!schema.includes(rlsNeedle)) {
    fail(`Storage RLS missing: expected in db/schema.sql -> ${rlsNeedle}`)
  }

  const ops = ["select", "insert", "update", "delete"]
  for (const op of ops) {
    const needle = `on storage.objects for ${op}`
    if (!schema.includes(needle)) {
      fail(`Storage policies missing: expected "${needle}" in db/schema.sql`)
    }
  }

  // Ensure owner-only auth guard is present in at least one policy block.
  const anyPolicyNeedle = "on storage.objects for select"
  if (!hasAuthUidNearPolicy(schema, anyPolicyNeedle)) {
    fail(`Storage policies look incomplete: expected auth.uid() near "${anyPolicyNeedle}"`)
  }

  // Ensure bucket restriction is present (project_images).
  if (!schema.includes("bucket_id = 'project_images'")) {
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
      // Skip common noise.
      if (ent.name === "node_modules" || ent.name === ".next" || ent.name === ".git") continue
      out.push(...walk(full))
    } else {
      out.push(full)
    }
  }
  return out
}

function verifyNoServiceRoleEnvUsage() {
  // Only detect *actual env variable reads* in runtime code (avoid false positives in docs/comments).
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
      if (rx.test(text)) hits.push({ filePath, match: rx.toString() })
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

  // Verify schema includes relevant embedded migrations (coarse presence check).
  const requiredMarkers = [
    "BEGIN db/001_init.sql",
    "BEGIN db/006_storage_project_images_policies.sql",
    "BEGIN db/007_project_image_state.sql",
    "BEGIN db/015_rls_policy_optimizations.sql",
  ]
  for (const marker of requiredMarkers) {
    if (!schema.includes(marker)) fail(`db/schema.sql missing marker: ${marker}`)
  }

  // Critical tables: owner-only app data.
  const publicTables = [
    "projects",
    "project_images",
    "project_workspace",
    "project_grid",
    "project_image_state",
    "project_vectorization_settings",
    "project_pdfs",
    "project_filter_settings",
    "project_generation",
  ]

  for (const table of publicTables) verifyPublicTable(schema, table)
  verifyStoragePolicies(schema)
  verifyNoServiceRoleEnvUsage()

  console.log(`OK: RLS + policy checks passed for ${publicTables.length} tables + storage.objects.`)
}

main()

