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

// Node 20 ships without a native WebSocket global, so any code path
// that constructs a supabase-js client without an explicit `realtime`
// transport (e.g. createSupabaseServiceRoleClient) crashes during
// import. Polyfilling once at module-load gives every integration test
// a working client without each call having to pass its own override.
if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === "undefined") {
  ;(globalThis as { WebSocket?: unknown }).WebSocket = ws as unknown
}

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
// Anon key + JWT secret for user-scoped (RLS-enforcing) clients. Defaults are
// the well-known local `supabase start` demo values (identical across every
// CLI install; not prod secrets). CI forwards the live values from
// `supabase status` via run-integration-tests.mjs.
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_INTEGRATION_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
const SUPABASE_JWT_SECRET =
  process.env.SUPABASE_INTEGRATION_JWT_SECRET ?? "super-secret-jwt-token-with-at-least-32-characters-long"

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

function base64url(input: string): string {
  return Buffer.from(input).toString("base64url")
}

/**
 * Mints a short-lived HS256 JWT the local GoTrue/PostgREST stack accepts as
 * an authenticated user. Signed with the local JWT secret so `auth.uid()`
 * resolves to `userId` and RLS policies apply. Hand-rolled (no jsonwebtoken
 * dep) because the claim set is tiny and fixed.
 */
function mintUserJwt(userId: string): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const nowS = Math.floor(Date.now() / 1000)
  const payload = base64url(
    JSON.stringify({ sub: userId, role: "authenticated", aud: "authenticated", iat: nowS, exp: nowS + 3600 }),
  )
  const signingInput = `${header}.${payload}`
  const signature = crypto.createHmac("sha256", SUPABASE_JWT_SECRET).update(signingInput).digest("base64url")
  return `${signingInput}.${signature}`
}

/**
 * Returns a Supabase client scoped to `userId` — requests carry the user's
 * JWT, so RLS is enforced exactly as it is for that user in production. Use
 * this (never the service client) to assert cross-owner isolation.
 */
export function getUserClient(userId: string): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${mintUserJwt(userId)}` } },
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
  kind:
    | "master"
    | "working_copy"
    | "filter_working_copy"
    | "trace_base"
    | "trace_output"
  // Required for any non-master kind: `non_master_requires_source_kind_ck`
  // (NOT VALID but enforced for new rows) demands source_image_id IS NOT NULL.
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
 * Seeds the project's single `project_image_trace` row (PK is
 * `project_id`, so exactly one per project). Wires both image
 * pointers:
 *   - `output_image_id` (NOT NULL) → a trace_output row. Its FK is
 *     ON DELETE CASCADE, so deleting the trace_output removes this
 *     trace row.
 *   - `baseImageId` (optional) → a trace_base row. Its FK
 *     (`project_image_trace_base_image_id_fkey`) is ON DELETE
 *     RESTRICT, so the trace_base cannot be deleted while this row
 *     still points at it. Pass it to exercise the second RESTRICT
 *     path in the delete cascade (M4).
 */
export async function seedTrace(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  outputImageId: string
  baseImageId?: string | null
  kind?: "pixelate" | "linerate"
}): Promise<void> {
  const { supabase, projectId, outputImageId, baseImageId, kind } = args
  const { error } = await supabase.from("project_image_trace").insert({
    project_id: projectId,
    kind: kind ?? "pixelate",
    params: {},
    output_image_id: outputImageId,
    base_image_id: baseImageId ?? null,
  })
  if (error) {
    throw new Error(`seedTrace: insert failed: ${error.message}`)
  }
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
