/**
 * Verify remote RLS + Storage policies are applied (Supabase CLI-first).
 *
 * Responsibilities:
 * - Fetch the remote schema via Supabase CLI (`supabase db dump --linked`).
 * - Verify that Storage RLS is enabled and policies exist for CRUD on `storage.objects`.
 * - Verify policies restrict access to the `project_images` bucket and include `auth.uid()`.
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

const root = process.cwd()

function fail(message) {
  console.error(message)
  process.exit(1)
}

function runSupabaseDbDumpStorageSchema() {
  const pw = (process.env.SUPABASE_DB_PASSWORD ?? process.env.SUPABASE_DB_PASS ?? "").trim()

  // Prefer a file output to avoid stdout truncation issues in CI logs.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gruf-remote-rls-"))
  const outFile = path.join(tmpDir, `storage.schema.${crypto.randomUUID()}.sql`)

  const args = ["db", "dump", "--linked", "--schema", "storage", "--file", outFile]
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

function main() {
  const res = runSupabaseDbDumpStorageSchema()
  if (!res.ok) {
    console.error("Failed to dump remote storage schema via Supabase CLI.")
    console.error(`Reason: ${res.reason}`)
    if (res.stderr) console.error(res.stderr.trim())
    console.error(
      "\nTip: run `supabase link --password \"$SUPABASE_DB_PASSWORD\"` once, or set SUPABASE_DB_PASSWORD for non-interactive CI/local checks."
    )
    process.exit(1)
  }

  verifyStoragePolicies(res.sql)

  console.log("OK: remote storage.objects has RLS enabled and required policies are present.")
}

main()

