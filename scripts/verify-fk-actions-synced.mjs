/**
 * Verify FK referential actions (ON DELETE / ON UPDATE) agree between the
 * migration chain and db/schema.sql.
 *
 * Why this exists (the H1 gap, #588):
 *   The self-referential project_images_source_image_id_fkey was ON DELETE
 *   RESTRICT in the migration baseline but ON DELETE CASCADE in db/schema.sql
 *   (dumped from a prod DB that had drifted). Nothing caught it:
 *     - schema_sync_check (ci.yml) only asserts db/schema.sql was *touched*
 *       when a migration changes — not that their contents agree.
 *     - verify:schema-drift compares db/schema.sql <-> prod (both CASCADE) and
 *       needs --linked prod creds, so normal PR CI never runs it.
 *   => No gate ever compared the *migration-chain resolved state* against
 *      db/schema.sql. This script is that gate.
 *
 * How it closes the loop without prod creds:
 *   - verify:schema-drift (deploy-time) enforces db/schema.sql == prod.
 *   - this script (PR-time) enforces migration-chain == db/schema.sql.
 *   - transitively, migration-chain == prod — proven with only a local,
 *     freshly-migrated Supabase (the one the `integration:` CI job boots).
 *
 * Ground truth for the migration chain is pg_constraint on the live local DB
 * (Postgres has already resolved every DROP/ADD/rename), diffed against the FK
 * definitions parsed out of db/schema.sql (canonical pg_dump form).
 *
 * Soft-skips when no local DB is reachable so it's safe to chain locally; set
 * FK_ACTIONS_REQUIRE_DB=1 (the CI integration step does) to turn the skip into
 * a hard failure so a down stack can't silently pass the gate.
 */
import fs from "node:fs"
import path from "node:path"

import pg from "pg"

const root = process.cwd()
const schemaPath = path.join(root, "db", "schema.sql")
const connectionString =
  process.env.SUPABASE_DB_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
const requireDb = process.env.FK_ACTIONS_REQUIRE_DB === "1"

// pg_constraint.confdeltype / confupdtype single-char codes -> SQL action text.
const ACTION_BY_CODE = {
  a: "NO ACTION",
  r: "RESTRICT",
  c: "CASCADE",
  n: "SET NULL",
  d: "SET DEFAULT",
}

function fail(msg) {
  console.error(`[verify-fk-actions-synced] ${msg}`)
  process.exit(1)
}

function skipOrFail(reason) {
  if (requireDb) fail(`FK_ACTIONS_REQUIRE_DB=1 but ${reason}`)
  console.warn(`[verify-fk-actions-synced] SKIPPED: ${reason}`)
  process.exit(0)
}

if (!fs.existsSync(schemaPath)) fail(`Missing ${schemaPath}`)

/**
 * Parse FK referential actions out of db/schema.sql, scoped to the `public`
 * schema.
 *
 * pg_dump always emits FKs as standalone
 *   ALTER TABLE ONLY "<schema>"."<table>"
 *       ADD CONSTRAINT "<name>" FOREIGN KEY (...) REFERENCES ... [ON UPDATE x] [ON DELETE y];
 * statements (never inline in CREATE TABLE). db/schema.sql dumps `public` AND
 * `storage`; the DB side (pg_constraint) is filtered to `public`, so anchor on
 * the ALTER TABLE prefix and keep only public FKs — the `storage.*` FKs are
 * Supabase-managed, not defined by our migrations. A missing ON DELETE /
 * ON UPDATE clause means NO ACTION.
 */
function parseSchemaFks(sql) {
  const out = new Map()
  const stmtRe =
    /ALTER TABLE (?:ONLY )?"([^"]+)"\."[^"]+"\s+ADD CONSTRAINT "([^"]+)"\s+FOREIGN KEY\b[\s\S]*?;/g
  for (const m of sql.matchAll(stmtRe)) {
    const schema = m[1]
    if (schema !== "public") continue
    const name = m[2]
    const body = m[0]
    const onDelete = /ON DELETE (NO ACTION|RESTRICT|CASCADE|SET NULL|SET DEFAULT)/.exec(body)?.[1] ?? "NO ACTION"
    const onUpdate = /ON UPDATE (NO ACTION|RESTRICT|CASCADE|SET NULL|SET DEFAULT)/.exec(body)?.[1] ?? "NO ACTION"
    out.set(name, { onDelete, onUpdate })
  }
  return out
}

async function readDbFks() {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 4000 })
  await client.connect()
  try {
    const { rows } = await client.query(`
      SELECT con.conname AS name,
             con.confdeltype AS on_delete,
             con.confupdtype AS on_update
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE con.contype = 'f' AND nsp.nspname = 'public'
      ORDER BY con.conname
    `)
    const out = new Map()
    for (const r of rows) {
      out.set(r.name, {
        onDelete: ACTION_BY_CODE[r.on_delete] ?? r.on_delete,
        onUpdate: ACTION_BY_CODE[r.on_update] ?? r.on_update,
      })
    }
    return out
  } finally {
    await client.end()
  }
}

let dbFks
try {
  dbFks = await readDbFks()
} catch (err) {
  skipOrFail(`could not query the local Supabase DB (${connectionString}): ${err.message}`)
}

const schemaFks = parseSchemaFks(fs.readFileSync(schemaPath, "utf8"))

const problems = []
for (const [name, db] of dbFks) {
  const committed = schemaFks.get(name)
  if (!committed) {
    problems.push(`FK "${name}" exists in the migration chain but not in db/schema.sql.`)
    continue
  }
  if (committed.onDelete !== db.onDelete) {
    problems.push(
      `FK "${name}" ON DELETE differs: migration chain = ${db.onDelete}, db/schema.sql = ${committed.onDelete}.`,
    )
  }
  if (committed.onUpdate !== db.onUpdate) {
    problems.push(
      `FK "${name}" ON UPDATE differs: migration chain = ${db.onUpdate}, db/schema.sql = ${committed.onUpdate}.`,
    )
  }
}
for (const name of schemaFks.keys()) {
  if (!dbFks.has(name)) {
    problems.push(`FK "${name}" exists in db/schema.sql but not in the migration chain.`)
  }
}

if (problems.length > 0) {
  console.error("[verify-fk-actions-synced] FK referential actions drifted between the migration chain and db/schema.sql:")
  for (const p of problems) console.error(`  - ${p}`)
  console.error(
    "\nThis is the H1 drift class (#588): the migration chain and the committed schema disagree\n" +
      "on a FK's ON DELETE/ON UPDATE. Fix the migration (or add one) so the chain matches intent,\n" +
      "then `npm run db:dump` (or hand-align the db/schema.sql FK line) so both sides agree.",
  )
  process.exit(1)
}

console.log(`OK: ${dbFks.size} public FK referential action(s) match between the migration chain and db/schema.sql.`)
