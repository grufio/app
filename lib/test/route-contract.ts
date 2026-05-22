/**
 * Shared setup for API route *contract* tests.
 *
 * Every `/api/projects/[projectId]/*` handler needs the same two mocks:
 * the server Supabase client and the `requireUser` auth guard. Centralise
 * them here so each route test only declares its own service-layer mocks.
 *
 * Lives under `lib/test/**` so it is excluded from coverage and never
 * collected as a test (it is not a `*.test.ts` file).
 */
import { vi } from "vitest"

/** Fixed, RFC-4122-valid UUIDs for use across route contract tests. */
export const TEST_UUIDS = {
  project: "c104be01-d7b0-4af4-a446-8326cd47a282",
  image: "2f5d1b28-0d9c-4d04-b2c5-8f1f3f7df5b0",
  filter: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  user: "0a0a0a0a-0000-4000-8000-000000000000",
}

/**
 * Reset the module registry and install the server-client + auth mocks.
 * Call first in a test, then add any service-layer `vi.doMock`s, then
 * dynamically `import("./route")`.
 *
 * `authed: false` makes `requireUser` return the standard 401 so callers
 * can assert the unauthorized path. The real `isUuid` / `jsonError` /
 * `readJson` are preserved via `importActual`, so param/body validation
 * still runs for real.
 */
export function setupRouteMocks(opts: { supabase: unknown; authed?: boolean }) {
  vi.resetModules()

  vi.doMock("@/lib/supabase/server", () => ({
    createSupabaseServerClient: async () => opts.supabase,
  }))

  vi.doMock("@/lib/api/route-guards", async () => {
    const actual = await vi.importActual<typeof import("@/lib/api/route-guards")>(
      "@/lib/api/route-guards",
    )
    const authed = opts.authed ?? true
    return {
      ...actual,
      requireUser: async () =>
        authed
          ? { ok: true as const, user: { id: TEST_UUIDS.user } }
          : { ok: false as const, res: actual.jsonError("Unauthorized", 401, { stage: "auth" }) },
    }
  })
}

/** Wrap route params in the `{ params: Promise<...> }` shape Next passes. */
export function routeParams<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) }
}

/** Build a JSON POST/PATCH Request. */
export function jsonRequest(body: unknown, method = "POST") {
  return new Request("http://test.local", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}
