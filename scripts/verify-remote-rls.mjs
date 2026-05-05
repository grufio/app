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

function hasAuthUidNear(sql, needle) {
  const idx = sql.indexOf(needle)
  if (idx < 0) return false
  const window = sql.slice(idx, idx + 2000)
  return window.includes("auth.uid()")
}

function verifyStoragePolicies(sql) {
  const rlsNeedle = "alter table storage.objects enable row level security;"
  if (!sql.includes(rlsNeedle)) {
    fail(`Remote storage RLS missing: expected "${rlsNeedle}" in storage schema dump`)
  }

  const ops = ["select", "insert", "update", "delete"]
  for (const op of ops) {
    const needle = `on storage.objects for ${op}`
    if (!sql.includes(needle)) {
      fail(`Remote storage policies missing: expected "${needle}" in storage schema dump`)
    }
  }

  if (!sql.includes("bucket_id = 'project_images'")) {
    fail("Remote storage policies incomplete: expected bucket_id = 'project_images' restriction")
  }

  // Require auth guard to exist near at least one policy.
  const anyPolicyNeedle = "on storage.objects for select"
  if (!hasAuthUidNear(sql, anyPolicyNeedle)) {
    fail(`Remote storage policies incomplete: expected auth.uid() near "${anyPolicyNeedle}"`)
  }
}

function verifyPublicTablePolicies(sql, table) {
  const rlsNeedle = `alter table "public"."${table}" enable row level security;`
  const rlsAltNeedle = `alter table public.${table} enable row level security;`
  if (!sql.includes(rlsNeedle) && !sql.includes(rlsAltNeedle)) {
    fail(`Remote RLS missing for public.${table}: expected "${rlsAltNeedle}" in public schema dump`)
  }

  // Look for at least one CREATE POLICY ... ON public.<table> with auth.uid() nearby.
  // pg_dump may emit either `on "public"."<table>"` or `on public.<table>`.
  const policyAnchors = [
    `on "public"."${table}"`,
    `on public.${table}`,
  ]
  const anchor = policyAnchors.find((needle) => sql.includes(needle))
  if (!anchor) {
    fail(`Remote policies missing for public.${table}: expected at least one CREATE POLICY ... ON public.${table}`)
  }
  if (!hasAuthUidNear(sql, anchor)) {
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
