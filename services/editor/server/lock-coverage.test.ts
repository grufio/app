import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * Static gate: every project-mutating RPC must serialize on the same
 * project advisory key — `pg_advisory_xact_lock(hashtext(p_project_id::text))`.
 *
 * Postgres advisory locks are reentrant within a transaction, so nested
 * RPC calls (e.g. `set_active_image_with_state` → `set_active_image`)
 * are safe; what's *unsafe* is a sibling RPC silently mutating project
 * state without taking the same lock — that race re-introduces the
 * concurrency bug class fixed in 20260507120000.
 *
 * This test scans `db/schema.sql` for every function that mutates a
 * project-scoped table and asserts each one calls
 * `pg_advisory_xact_lock(hashtext(p_project_id::text))`. New RPCs must
 * either take the lock or be added to the `EXEMPT` allowlist with a
 * one-line reason.
 *
 * Note: as of 2026-05-07 `db/schema.sql` is a `pg_dump` snapshot —
 * uppercase DDL with quoted identifiers (`CREATE OR REPLACE FUNCTION
 * "public"."<name>"(...)`). There is at most one definition per RPC, so
 * we no longer need to pick "the last block".
 */

const PROJECT_MUTATING_RPCS = [
  "append_project_image_filter",
  "remove_project_image_filter",
  "delete_project",
  "set_active_image",
  "set_active_image_with_state",
] as const

const ADVISORY_LOCK_RE = /PERFORM\s+"?pg_advisory_xact_lock"?\s*\(\s*"?hashtext"?\s*\([^)]*p_project_id[^)]*\)\s*\)/i

describe("project advisory lock coverage", () => {
  const schema = readFileSync(resolve(process.cwd(), "db/schema.sql"), "utf8")

  it.each(PROJECT_MUTATING_RPCS)("%s holds pg_advisory_xact_lock on the project key", (rpcName) => {
    // Match the function header — quoted or unquoted, case-insensitive — then
    // greedy-grab through the dollar-quoted body. pg_dump uses `AS $_$ … $_$`
    // (with optional inner tag); hand-edited variants use `AS $$ … $$`.
    // Iterate ALL definitions: a function may be overloaded and
    // pg_dump's emission order is not stable across reseeds. The lock
    // invariant holds if at least one overload takes the lock directly
    // OR transitively (delegating to another locked RPC).
    const fnRe = new RegExp(
      `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+"?public"?\\."?${rpcName}"?\\s*\\([^)]*\\)[\\s\\S]+?\\$([_a-zA-Z]*)\\$[\\s\\S]+?\\$\\1\\$`,
      "ig",
    )
    const matches = Array.from(schema.matchAll(fnRe))
    expect(matches.length, `expected at least one definition of ${rpcName} in db/schema.sql`).toBeGreaterThan(0)

    // Direct lock takers — the function's own body calls pg_advisory_xact_lock.
    const direct = matches.filter((m) => ADVISORY_LOCK_RE.test(m[0]))

    // Transitive: function body calls another known-locked RPC. This covers
    // wrapper overloads that delegate to a sibling that already holds the
    // lock (e.g. set_active_image_with_state calls set_active_image, which
    // is in this list).
    const otherLocked = new Set(PROJECT_MUTATING_RPCS.filter((n) => n !== rpcName))
    const transitive = matches.filter((m) =>
      Array.from(otherLocked).some((delegate) => new RegExp(`\\bperform\\b[\\s\\S]*?\\b${delegate}\\b`, "i").test(m[0]))
    )

    expect(
      direct.length > 0 || transitive.length > 0,
      `${rpcName} must call pg_advisory_xact_lock(hashtext(p_project_id::text)) directly or via a locked RPC`,
    ).toBe(true)
  })
})
