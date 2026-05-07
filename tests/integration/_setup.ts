/**
 * Integration test setup helpers.
 *
 * Talks to a local Supabase started via `supabase start`. Connection
 * details come from environment variables (with sensible defaults that
 * match the standard `supabase/config.toml` ports — port 54321 for
 * PostgREST, port 54322 for direct Postgres).
 *
 * What this file provides:
 *   - `getServiceClient()` — service-role Supabase client, bypasses RLS.
 *     Used by tests to seed fixtures and call RPCs directly.
 *   - `seedProject({ ownerId? })` — inserts a project row + owner user
 *     and returns its UUID. Tests get a clean slate per call.
 *   - `cleanupProject(projectId)` — best-effort delete of a seeded
 *     project (cascades remove its images / filters / state).
 *
 * Tests should be self-contained: each one seeds what it needs and
 * cleans up in `afterEach`. Don't share state between tests.
 */
import { createClient } from "@supabase/supabase-js"
import type { SupabaseClient } from "@supabase/supabase-js"
import crypto from "node:crypto"
import { Client as PgClient } from "pg"
import ws from "ws"

import type { Database } from "@/lib/supabase/database.types"

// Defaults match supabase/config.toml. Override via env when running
// against a non-standard local instance.
const SUPABASE_URL = process.env.SUPABASE_INTEGRATION_URL ?? "http://127.0.0.1:54321"
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_INTEGRATION_SERVICE_KEY ?? ""
// Direct Postgres connection — used to insert auth.users rows. The
// PostgREST gateway only exposes `public`, and the local gotrue's
// admin endpoint rejects HS256 service-role JWTs in newer CLI
// versions. Going through `pg` sidesteps both.
const SUPABASE_DB_URL =
  process.env.SUPABASE_INTEGRATION_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

/**
 * Returns a service-role Supabase client that bypasses RLS. Suitable
 * for seeding fixtures and asserting state. Production code should
 * never use this.
 */
export function getServiceClient(): SupabaseClient<Database> {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_INTEGRATION_SERVICE_KEY is unset. Run `supabase start` and copy the\n" +
        "service-role key from the CLI output (or from `supabase status`) into the\n" +
        "env var before running integration tests.",
    )
  }
  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Node 20 doesn't ship native WebSocket; the realtime client crashes
    // on construction without an explicit transport. We don't use realtime
    // in integration tests, but supabase-js initialises it eagerly.
    realtime: { transport: ws as unknown as never },
  })
}

/**
 * Seeds an auth user + project. Returns the UUIDs so tests can use
 * them as foreign keys for further inserts.
 *
 * `auth.users` is inserted directly via a `pg` connection because
 *   1. PostgREST only exposes the `public` schema
 *   2. gotrue's admin endpoint in the local stack uses ES256 keys,
 *      while the CLI hands out an HS256 service-role JWT — they don't
 *      match, every admin call returns "bad_jwt"
 * The direct insert bypasses both layers.
 */
export async function seedProject(args: {
  supabase: SupabaseClient<Database>
  ownerEmail?: string
}): Promise<{ projectId: string; ownerId: string }> {
  const supabase = args.supabase
  const ownerId = crypto.randomUUID()
  const projectId = crypto.randomUUID()
  const ownerEmail = args.ownerEmail ?? `test-${ownerId}@integration.test`

  const pg = new PgClient({ connectionString: SUPABASE_DB_URL })
  await pg.connect()
  try {
    await pg.query(
      `insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, now(), '{}'::jsonb, '{}'::jsonb, now(), now())`,
      [ownerId, ownerEmail],
    )
  } finally {
    await pg.end()
  }

  const { error: projErr } = await supabase
    .from("projects")
    .insert({ id: projectId, name: "integration-test", owner_id: ownerId })
  if (projErr) {
    // Best-effort cleanup of the auth user before throwing.
    const cleanup = new PgClient({ connectionString: SUPABASE_DB_URL })
    await cleanup.connect()
    try {
      await cleanup.query("delete from auth.users where id = $1", [ownerId])
    } finally {
      await cleanup.end()
    }
    throw new Error(`seedProject: insert project failed: ${projErr.message}`)
  }

  return { projectId, ownerId }
}

/**
 * Seeds a `project_images` row. Storage is *not* touched — these tests
 * exercise DB invariants (cascades, locks, stack_order), not pixels.
 * The `storage_path` is a synthetic value that points at nothing.
 */
export async function seedImage(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  kind: "master" | "working_copy" | "filter_working_copy"
  sourceImageId?: string | null
  name?: string
}): Promise<{ imageId: string }> {
  const { supabase, projectId, kind, sourceImageId, name } = args
  const imageId = crypto.randomUUID()
  const { error } = await supabase.from("project_images").insert({
    id: imageId,
    project_id: projectId,
    name: name ?? `img-${imageId.slice(0, 8)}`,
    format: "png",
    width_px: 100,
    height_px: 100,
    storage_path: `synthetic/${imageId}.png`,
    kind,
    source_image_id: sourceImageId ?? null,
  })
  if (error) {
    throw new Error(`seedImage: insert failed: ${error.message}`)
  }
  return { imageId }
}

/**
 * Best-effort cleanup. Hard-deletes the project (cascades), then drops
 * the seeded auth user. Safe to call in `afterEach` even if the test
 * itself deleted the project — a missing row is not an error.
 */
export async function cleanupProject(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  ownerId: string
}): Promise<void> {
  const { supabase, projectId, ownerId } = args
  // Filters first — delete_project's cascade depends on it. If the
  // test already called delete_project successfully this is a no-op.
  // PostgREST builders are thenables, not Promises, so we await each
  // inside its own try/catch instead of chaining .catch().
  const swallow = async (p: PromiseLike<unknown>) => {
    try {
      await p
    } catch {
      /* best-effort cleanup */
    }
  }
  await swallow(supabase.from("project_image_filters").delete().eq("project_id", projectId))
  await swallow(supabase.from("project_image_state").delete().eq("project_id", projectId))
  await swallow(supabase.from("project_images").delete().eq("project_id", projectId))
  await swallow(supabase.from("projects").delete().eq("id", projectId))
  // auth.users delete cascades to projects, but we delete projects first
  // to keep the order deterministic if FKs change.
  const pg = new PgClient({ connectionString: SUPABASE_DB_URL })
  try {
    await pg.connect()
    await pg.query("delete from auth.users where id = $1", [ownerId])
  } catch {
    /* best-effort cleanup */
  } finally {
    await pg.end().catch(() => {})
  }
}
