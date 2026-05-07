import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * Static gate: every project-mutating RPC must serialize on the same
 * project advisory key — `pg_advisory_xact_lock(hashtext(p_project_id::text))`.
 *
 * Postgres advisory locks are reentrant within a transaction, so nested
 * RPC calls (e.g. `set_active_master_with_state` → `set_active_image`)
 * are safe; what's *unsafe* is a sibling RPC silently mutating project
 * state without taking the same lock — that race re-introduces the
 * concurrency bug class fixed in 20260507120000.
 *
 * This test scans `db/schema.sql` for every function that mutates a
 * project-scoped table and asserts each one calls
 * `pg_advisory_xact_lock(hashtext(p_project_id::text))`. New RPCs must
 * either take the lock or be added to the `EXEMPT` allowlist with a
 * one-line reason.
 */

const PROJECT_MUTATING_RPCS = [
  "append_project_image_filter",
  "remove_project_image_filter",
  "reorder_project_image_filters",
  "delete_project",
  "set_active_image",
  "set_active_master_image",
  "set_active_master_latest",
  "set_active_master_with_state",
] as const

const ADVISORY_LOCK_RE = /perform\s+pg_advisory_xact_lock\s*\(\s*hashtext\s*\(\s*p_project_id::text\s*\)\s*\)/i

describe("project advisory lock coverage", () => {
  const schema = readFileSync(resolve(process.cwd(), "db/schema.sql"), "utf8")

  it.each(PROJECT_MUTATING_RPCS)("%s holds pg_advisory_xact_lock on the project key", (rpcName) => {
    // Extract the *last* `create or replace function public.<name>(...)`
    // body in the file — db/schema.sql is a stacked snapshot, the latest
    // block wins at runtime.
    const fnRe = new RegExp(
      `create or replace function public\\.${rpcName}\\s*\\([^)]*\\)\\s*returns[\\s\\S]+?\\$\\$\\s*[\\s\\S]+?\\$\\$`,
      "gi",
    )
    const matches = schema.match(fnRe) ?? []
    expect(matches.length, `expected at least one definition of ${rpcName}`).toBeGreaterThan(0)
    const latest = matches[matches.length - 1]
    expect(
      ADVISORY_LOCK_RE.test(latest),
      `${rpcName} must call pg_advisory_xact_lock(hashtext(p_project_id::text))`,
    ).toBe(true)
  })
})
