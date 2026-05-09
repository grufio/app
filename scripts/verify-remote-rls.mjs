/**
 * Verify remote RLS + Storage policies are applied (Supabase CLI-first).
 *
 * Responsibilities:
 * - Fetch the remote schema via Supabase CLI (`supabase db dump --linked`).
 * - Verify that Storage RLS is enabled and policies exist for CRUD on `storage.objects`.
 * - Verify policies restrict access to the `project_images` bucket and include `auth.uid()`.
 * - Verify that every public RLS-protected table has RLS enabled remotely AND at least
 *   one owner-only policy with `auth.uid()` nearby.
 *
 * Exit codes:
 * - 0: OK (remote has required RLS + policies).
 * - 1: Missing/invalid policies OR cannot query remote schema via Supabase CLI.
 *
 * Notes:
 * - This script is a release gate. It does NOT modify remote state.
 * - Storage DDL may require applying in Supabase SQL editor depending on ownership/privileges.
 */
import { spawnSync } from "node:child_process"
import path from "node:path"
import fs from "node:fs"
import os from "node:os"
import crypto from "node:crypto"

import { RLS_PROTECTED_TABLES } from "./_rls-tables.mjs"

const root = process.cwd()

function fail(message) {
  console.error(message)
  process.exit(1)
}

function runSupabaseDbDump(schemaName) {
  const pw = (process.env.SUPABASE_DB_PASSWORD ?? process.env.SUPABASE_DB_PASS ?? "").trim()

  // Prefer a file output to avoid stdout truncation issues in CI logs.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gruf-remote-rls-"))
  const outFile = path.join(tmpDir, `${schemaName}.schema.${crypto.randomUUID()}.sql`)

  const args = ["db", "dump", "--linked", "--schema", schemaName, "--file", outFile]
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

  if (!fs.existsSync(outFile)) {
    return {
      ok: false,
      reason: `Supabase CLI did not write expected dump file at ${outFile}`,
      stdout: res.stdout ?? "",
      stderr: res.stderr ?? "",
    }
  }

  const sql = fs.readFileSync(outFile, "utf8")
  return { ok: true, sql, outFile, stdout: res.stdout ?? "", stderr: res.stderr ?? "" }
}

// pg_dump output varies in casing and identifier quoting across CLI versions
// (e.g. `ALTER TABLE "storage"."objects"` vs `alter table storage.objects`).
// Normalise once here so all `.includes()` checks below can use a single
// canonical lower-case, unquoted form. Single-quoted string literals (e.g.
// 'project_images') are preserved by only stripping double quotes.
function normalize(sql) {
  return sql.toLowerCase().replace(/"/g, "")
}

// pg_dump emits the table identifier in many places (CREATE INDEX, CREATE
// TRIGGER, GRANT, ALTER TABLE, CREATE POLICY). The first match for an anchor
// like "on public.projects" is usually a CREATE INDEX line with no policy
// body afterwards. Walk every occurrence and return true as soon as any
// 2000-char window contains auth.uid(); only fail if no occurrence does.
function hasAuthUidNear(haystack, needle) {
  let from = 0
  while (true) {
    const idx = haystack.indexOf(needle, from)
    if (idx < 0) return false
    const window = haystack.slice(idx, idx + 2000)
    if (window.includes("auth.uid()")) return true
    from = idx + needle.length
  }
}

function verifyStoragePolicies(sql) {
  const haystack = normalize(sql)
  const rlsNeedle = "alter table storage.objects enable row level security;"
  if (!haystack.includes(rlsNeedle)) {
    fail(`Remote storage RLS missing: expected "${rlsNeedle}" in storage schema dump`)
  }

  const ops = ["select", "insert", "update", "delete"]
  for (const op of ops) {
    const needle = `on storage.objects for ${op}`
    if (!haystack.includes(needle)) {
      fail(`Remote storage policies missing: expected "${needle}" in storage schema dump`)
    }
  }

  if (!haystack.includes("bucket_id = 'project_images'")) {
    fail("Remote storage policies incomplete: expected bucket_id = 'project_images' restriction")
  }

  // Require auth guard to exist near at least one policy.
  const anyPolicyNeedle = "on storage.objects for select"
  if (!hasAuthUidNear(haystack, anyPolicyNeedle)) {
    fail(`Remote storage policies incomplete: expected auth.uid() near "${anyPolicyNeedle}"`)
  }
}

function verifyPublicTablePolicies(sql, table) {
  const haystack = normalize(sql)
  const rlsNeedle = `alter table public.${table} enable row level security;`
  if (!haystack.includes(rlsNeedle)) {
    fail(`Remote RLS missing for public.${table}: expected "${rlsNeedle}" in public schema dump`)
  }

  const anchor = `on public.${table}`
  if (!haystack.includes(anchor)) {
    fail(`Remote policies missing for public.${table}: expected at least one CREATE POLICY ... ON public.${table}`)
  }
  if (!hasAuthUidNear(haystack, anchor)) {
    fail(`Remote policies incomplete for public.${table}: expected auth.uid() near "${anchor}"`)
  }
}

function main() {
  const storageDump = runSupabaseDbDump("storage")
  if (!storageDump.ok) {
    console.error("Failed to dump remote storage schema via Supabase CLI.")
    console.error(`Reason: ${storageDump.reason}`)
    if (storageDump.stderr) console.error(storageDump.stderr.trim())
    console.error(
      "\nTip: run `supabase link --password \"$SUPABASE_DB_PASSWORD\"` once, or set SUPABASE_DB_PASSWORD for non-interactive CI/local checks."
    )
    process.exit(1)
  }
  verifyStoragePolicies(storageDump.sql)

  const publicDump = runSupabaseDbDump("public")
  if (!publicDump.ok) {
    console.error("Failed to dump remote public schema via Supabase CLI.")
    console.error(`Reason: ${publicDump.reason}`)
    if (publicDump.stderr) console.error(publicDump.stderr.trim())
    process.exit(1)
  }
  for (const table of RLS_PROTECTED_TABLES) verifyPublicTablePolicies(publicDump.sql, table)

  console.log(
    `OK: remote has RLS + policies for storage.objects and ${RLS_PROTECTED_TABLES.length} public tables.`
  )
}

main()
