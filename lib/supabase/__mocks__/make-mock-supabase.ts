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
   *
   * Fields:
   *  - opArgs: arguments passed to the *initial* operation
   *    (e.g. `.upsert(row, opts)` -> opArgs = [row, opts]).
   *    `select` and `delete` take no args, so opArgs is `[]` for those.
   *  - args: arg-arrays for each chain method invocation, in order.
   *    `[[col, val], [col, val]]` for `.eq(col, val).eq(col, val)`.
   *  - ops: the chain method names, including the initial op and any
   *    terminal `.single` / `.maybeSingle`.
   */
  onCall?: (chain: { opArgs: unknown[]; args: unknown[]; ops: string[] }) => void
}

/** Per-table operation handlers. Each one is the *terminal* chain value.
 *
 * The function form is evaluated lazily at terminal time and receives
 * the chain context. Useful when one production callsite varies its
 * terminal between `.maybeSingle()` (single row) and `await chain`
 * (array) — the function can branch on `ops.includes("maybeSingle")`.
 */
type ChainCtx = { opArgs: unknown[]; args: unknown[]; ops: string[] }
export type MockTableOps = {
  select?: MockResult | ((chain: ChainCtx) => MockResult)
  insert?: MockResult | ((chain: ChainCtx) => MockResult)
  update?: MockResult | ((chain: ChainCtx) => MockResult)
  delete?: MockResult | ((chain: ChainCtx) => MockResult)
  upsert?: MockResult | ((chain: ChainCtx) => MockResult)
}

export type MockStorageOps = {
  upload?: MockResult
  download?: MockResult<Blob>
  remove?: MockResult
  createSignedUrl?: MockResult<{ signedUrl: string }>
  // Matches supabase-js storage shape — both fields can be null when
  // the underlying object lookup failed for a specific path.
  createSignedUrls?: MockResult<Array<{ signedUrl: string | null; path: string | null; error?: string | null }>>
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

/**
 * Resolves a spec lazily at terminal time so the function-form has
 * access to the chain context. Lets tests vary the response based on
 * whether the production code awaited the chain (array form) or
 * called `.maybeSingle()` (single-row form).
 */
type ChainContext = { opArgs: unknown[]; args: unknown[]; ops: string[] }
function resolveResult(
  spec: MockResult | ((chain: ChainContext) => MockResult) | undefined,
  ctx: ChainContext,
): MockResult {
  if (typeof spec === "function") return spec(ctx)
  return spec ?? { data: null, error: null }
}

/**
 * Builds the chain proxy. Every chain method (.eq, .is, .in, .like,
 * .order, .limit) returns the same proxy and records the call. The
 * terminal `await` (or `.then`) returns the configured result.
 */
function makeChain(
  opName: string,
  opArgs: unknown[],
  spec: MockResult | ((chain: ChainContext) => MockResult) | undefined,
) {
  const ops: string[] = [opName]
  const args: unknown[] = []

  // Use a Proxy so every method we don't explicitly handle still
  // returns the same chain — this keeps tests compiling when the
  // production code adds a new filter method we haven't modelled yet.
  const handler = {
    get(target: unknown, prop: string | symbol) {
      if (prop === "then") {
        // Make the chain thenable: resolves to the configured result.
        return (resolve: (v: unknown) => unknown) => {
          const ctx = { opArgs, args, ops }
          const result = resolveResult(spec, ctx)
          if (result.onCall) result.onCall(ctx)
          return Promise.resolve({
            data: result.data ?? null,
            error: result.error ?? null,
          }).then(resolve)
        }
      }
      if (prop === "single" || prop === "maybeSingle") {
        return async () => {
          const ctx = { opArgs, args, ops: [...ops, prop as string] }
          const result = resolveResult(spec, ctx)
          if (result.onCall) result.onCall(ctx)
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
    select: vi.fn((...callArgs: unknown[]) => makeChain("select", callArgs, opsConfig?.select)),
    insert: vi.fn((...callArgs: unknown[]) => makeChain("insert", callArgs, opsConfig?.insert)),
    update: vi.fn((...callArgs: unknown[]) => makeChain("update", callArgs, opsConfig?.update)),
    delete: vi.fn((...callArgs: unknown[]) => makeChain("delete", callArgs, opsConfig?.delete)),
    upsert: vi.fn((...callArgs: unknown[]) => makeChain("upsert", callArgs, opsConfig?.upsert)),
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
    createSignedUrls: wrap<Array<{ signedUrl: string | null; path: string | null; error?: string | null }>>(ops?.createSignedUrls),
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
  const rpcFn = vi.fn(async (name: string, rpcArgs?: unknown) => {
    const spec = args.rpcs?.[name]
    if (spec?.onCall) spec.onCall({ opArgs: [name, rpcArgs], args: [], ops: ["rpc"] })
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
