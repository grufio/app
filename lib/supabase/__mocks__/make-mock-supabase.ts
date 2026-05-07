/**
 * Vitest helper: builds a minimal SupabaseClient mock for unit tests.
 *
 * Why: ~7 test files today hand-roll a `from()`-chain mock per file.
 * When the production code starts calling a new chain method (`.in()`,
 * `.maybeSingle()`, …) every one of those mocks has to be patched —
 * we hit exactly that drift twice during the storage-cleanup work
 * (services/editor/server/filter-chain-reset.test.ts and
 * services/editor/server/filter-working-copy.test.ts each needed a
 * separate fix in the same PR).
 *
 * This helper centralises the chain. Tests describe what should be
 * returned per `(table, op)` pair; the helper builds a thenable proxy
 * that satisfies whatever chain the production code calls (eq, is, in,
 * like, order, limit, single, maybeSingle, then) and resolves to the
 * configured payload.
 *
 * Scope intentionally narrow: this is a *testing* mock, not a Supabase
 * implementation. It models only the surface that production code
 * actually uses today (see fixture types below). Add new ops as new
 * tests need them — there's no benefit in modelling unused API.
 *
 * Status: introduced 2026-05-07. New tests SHOULD use this. Existing
 * hand-rolled mocks migrate in follow-up PRs (one cluster at a time).
 */
import { vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"

// --- Fixture types -------------------------------------------------------

export type MockResult<T = unknown> = {
  data?: T | null
  error?: { message: string; code?: string } | null
  /**
   * Optional spy: invoked with the chain args before the result resolves.
   * Useful when the test wants to assert *which* filters / ids the
   * production code passed.
   */
  onCall?: (chain: { args: unknown[]; ops: string[] }) => void
}

/** Per-table operation handlers. Each one is the *terminal* chain value. */
export type MockTableOps = {
  select?: MockResult | (() => MockResult)
  insert?: MockResult | (() => MockResult)
  update?: MockResult | (() => MockResult)
  delete?: MockResult | (() => MockResult)
  upsert?: MockResult | (() => MockResult)
}

export type MockStorageOps = {
  upload?: MockResult
  download?: MockResult<Blob>
  remove?: MockResult
  createSignedUrl?: MockResult<{ signedUrl: string }>
  createSignedUrls?: MockResult<Array<{ signedUrl: string; path: string }>>
}

export type MakeMockSupabaseArgs = {
  /** Per-table response config. Missing tables → empty success. */
  tables?: Record<string, MockTableOps>
  /** Per-bucket storage response config. */
  storage?: Record<string, MockStorageOps>
  /** RPC responses keyed by rpc-name. */
  rpcs?: Record<string, MockResult>
}

// --- Internals -----------------------------------------------------------

function resolveResult(spec: MockResult | (() => MockResult) | undefined): MockResult {
  if (typeof spec === "function") return spec()
  return spec ?? { data: null, error: null }
}

/**
 * Builds the chain proxy. Every chain method (.eq, .is, .in, .like,
 * .order, .limit) returns the same proxy and records the call. The
 * terminal `await` (or `.then`) returns the configured result.
 */
function makeChain(opName: string, spec: MockResult | (() => MockResult) | undefined) {
  const ops: string[] = [opName]
  const args: unknown[] = []
  const result = resolveResult(spec)

  // Use a Proxy so every method we don't explicitly handle still
  // returns the same chain — this keeps tests compiling when the
  // production code adds a new filter method we haven't modelled yet.
  const handler = {
    get(target: unknown, prop: string | symbol) {
      if (prop === "then") {
        // Make the chain thenable: resolves to the configured result.
        return (resolve: (v: unknown) => unknown) => {
          if (result.onCall) result.onCall({ args, ops })
          return Promise.resolve({
            data: result.data ?? null,
            error: result.error ?? null,
          }).then(resolve)
        }
      }
      if (prop === "single" || prop === "maybeSingle") {
        return async () => {
          if (result.onCall) result.onCall({ args, ops: [...ops, prop as string] })
          return { data: result.data ?? null, error: result.error ?? null }
        }
      }
      // Any other access → a chain method. Records and returns proxy.
      const op = String(prop)
      return (...callArgs: unknown[]) => {
        ops.push(op)
        args.push(callArgs)
        return proxy
      }
    },
  }
  const proxy = new Proxy({}, handler)
  return proxy
}

function makeTableQuery(tableName: string, opsConfig: MockTableOps | undefined) {
  return {
    select: vi.fn(() => makeChain("select", opsConfig?.select)),
    insert: vi.fn((..._args: unknown[]) => makeChain("insert", opsConfig?.insert)),
    update: vi.fn((..._args: unknown[]) => makeChain("update", opsConfig?.update)),
    delete: vi.fn(() => makeChain("delete", opsConfig?.delete)),
    upsert: vi.fn((..._args: unknown[]) => makeChain("upsert", opsConfig?.upsert)),
  }
}

function makeStorageBucket(bucketName: string, ops: MockStorageOps | undefined) {
  const wrap = <T>(spec: MockResult<T> | undefined) =>
    vi.fn(async (..._args: unknown[]) => ({
      data: spec?.data ?? null,
      error: spec?.error ?? null,
    }))
  return {
    upload: wrap(ops?.upload),
    download: wrap<Blob>(ops?.download),
    remove: wrap(ops?.remove),
    createSignedUrl: wrap<{ signedUrl: string }>(ops?.createSignedUrl),
    createSignedUrls: wrap<Array<{ signedUrl: string; path: string }>>(ops?.createSignedUrls),
  }
}

// --- Public API ----------------------------------------------------------

/**
 * Creates a SupabaseClient<Database> mock with the configured
 * per-table / per-bucket / per-rpc responses.
 *
 * The returned object is typed as `SupabaseClient<Database>` for
 * drop-in use, but is actually a vitest-mock structure — production
 * code that calls e.g. `supabase.realtime.channel(...)` (not modelled)
 * will throw `TypeError: ... is not a function` and that's the right
 * signal: the production code grew a new dependency the test should
 * configure.
 */
export function makeMockSupabase(args: MakeMockSupabaseArgs = {}): SupabaseClient<Database> {
  const fromFn = vi.fn((table: string) => makeTableQuery(table, args.tables?.[table]))
  const storageFromFn = vi.fn((bucket: string) => makeStorageBucket(bucket, args.storage?.[bucket]))
  const rpcFn = vi.fn(async (name: string) => {
    const spec = args.rpcs?.[name]
    return {
      data: spec?.data ?? null,
      error: spec?.error ?? null,
    }
  })

  return {
    from: fromFn,
    storage: { from: storageFromFn },
    rpc: rpcFn,
  } as unknown as SupabaseClient<Database>
}
