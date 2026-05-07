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

import type { Database } from "@/lib/supabase/database.types"

// Defaults match supabase/config.toml. Override via env when running
// against a non-standard local instance.
const SUPABASE_URL = process.env.SUPABASE_INTEGRATION_URL ?? "http://127.0.0.1:54321"
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_INTEGRATION_SERVICE_KEY ?? ""

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
  })
}

/**
 * Seeds an auth user + project. Returns the UUIDs so tests can use
 * them as foreign keys for further inserts.
 *
 * The auth user is inserted via the `auth.users` table directly — the
 * normal sign-up flow goes through Supabase Auth's HTTP API which would
 * be slow + flaky for hundreds of test runs. The service role can
 * insert directly.
 */
export async function seedProject(args: {
  supabase: SupabaseClient<Database>
  ownerEmail?: string
}): Promise<{ projectId: string; ownerId: string }> {
  const supabase = args.supabase
  const ownerId = crypto.randomUUID()
  const projectId = crypto.randomUUID()
  const ownerEmail = args.ownerEmail ?? `test-${ownerId}@integration.test`

  // Insert into auth.users via the admin API (service-role only).
  // Local Supabase exposes this via the Auth Admin SDK.
  const { error: userErr } = await supabase.auth.admin.createUser({
    id: ownerId,
    email: ownerEmail,
    email_confirm: true,
  })
  if (userErr) {
    throw new Error(`seedProject: createUser failed: ${userErr.message}`)
  }

  const { error: projErr } = await supabase
    .from("projects")
    .insert({ id: projectId, name: "integration-test", owner_id: ownerId })
  if (projErr) {
    // Best-effort cleanup of the auth user before throwing.
    await supabase.auth.admin.deleteUser(ownerId).catch(() => {})
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
  try {
    await supabase.auth.admin.deleteUser(ownerId)
  } catch {
    /* best-effort cleanup */
  }
}
