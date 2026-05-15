import { describe, expect, it, vi } from "vitest"

import { ensureWorkingCopyExists } from "./ensure"

type SelectResult = { data: unknown; error: unknown }

function makeSupabase(args: {
  workingCopyRow?: Record<string, unknown> | null
  masterRow?: Record<string, unknown> | null
  copyError?: { message: string } | null
  insertError?: { message: string; code?: string } | null
  insertedRows?: Array<Record<string, unknown>>
}) {
  const insertedRows = args.insertedRows ?? []
  // Two consecutive .select() calls: working_copy lookup, then master.
  const selectResults: SelectResult[] = [
    { data: args.workingCopyRow ?? null, error: null },
    { data: args.masterRow ?? null, error: null },
  ]
  let selectCallIdx = 0

  const makeChain = (terminalShape: "maybeSingle") => {
    const chain: Record<string, (...a: unknown[]) => unknown> = {}
    const proxy: Record<string, unknown> = {}
    const handler: Record<string, (...a: unknown[]) => unknown> = {
      eq: () => proxy,
      is: () => proxy,
      order: () => proxy,
      limit: () => proxy,
      [terminalShape]: async () => {
        const r = selectResults[selectCallIdx] ?? { data: null, error: null }
        selectCallIdx += 1
        return r
      },
    }
    Object.assign(chain, handler)
    Object.assign(proxy, handler)
    return proxy
  }

  const copyMock = vi.fn(async () => ({ error: args.copyError ?? null }))
  const removeMock = vi.fn(async () => ({ error: null }))

  return {
    supabase: {
      from: vi.fn(() => ({
        select: () => makeChain("maybeSingle"),
        insert: (row: Record<string, unknown>) => {
          if (args.insertError) {
            return Promise.resolve({ error: args.insertError })
          }
          insertedRows.push(row)
          return Promise.resolve({ error: null })
        },
      })),
      storage: {
        from: vi.fn(() => ({
          copy: copyMock,
          remove: removeMock,
        })),
      },
    } as never,
    insertedRows,
    copyMock,
    removeMock,
  }
}

describe("ensureWorkingCopyExists", () => {
  const projectId = "p1"

  it("returns existing working_copy without creating a new one", async () => {
    const setup = makeSupabase({
      workingCopyRow: {
        id: "wc-1",
        storage_bucket: "project_images",
        storage_path: "projects/p1/images/wc-1",
        format: "png",
        width_px: 100,
        height_px: 200,
        file_size_bytes: 1234,
        source_image_id: "master-1",
      },
    })

    const result = await ensureWorkingCopyExists({ supabase: setup.supabase, projectId })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.created).toBe(false)
      expect(result.imageId).toBe("wc-1")
      expect(result.sourceMasterId).toBe("master-1")
    }
    expect(setup.copyMock).not.toHaveBeenCalled()
    expect(setup.insertedRows).toHaveLength(0)
  })

  it("copies from master and inserts row when no working_copy exists", async () => {
    const setup = makeSupabase({
      workingCopyRow: null,
      masterRow: {
        id: "master-1",
        storage_bucket: "project_images",
        storage_path: "projects/p1/images/master-1",
        format: "jpeg",
        width_px: 800,
        height_px: 600,
        dpi: 300,
        file_size_bytes: 5000,
        name: "photo.jpg",
      },
    })

    const result = await ensureWorkingCopyExists({ supabase: setup.supabase, projectId })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.created).toBe(true)
      expect(result.sourceMasterId).toBe("master-1")
      expect(result.widthPx).toBe(800)
      expect(result.heightPx).toBe(600)
    }
    expect(setup.copyMock).toHaveBeenCalledTimes(1)
    expect(setup.insertedRows).toHaveLength(1)
    expect(setup.insertedRows[0].kind).toBe("working_copy")
    expect(setup.insertedRows[0].source_image_id).toBe("master-1")
  })

  it("returns no_master when neither working_copy nor master exists", async () => {
    const setup = makeSupabase({ workingCopyRow: null, masterRow: null })

    const result = await ensureWorkingCopyExists({ supabase: setup.supabase, projectId })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("no_master")
    }
    expect(setup.copyMock).not.toHaveBeenCalled()
  })

  it("rolls back storage copy when DB insert fails", async () => {
    const setup = makeSupabase({
      workingCopyRow: null,
      masterRow: {
        id: "master-1",
        storage_bucket: "project_images",
        storage_path: "projects/p1/images/master-1",
        format: "jpeg",
        width_px: 100,
        height_px: 100,
        file_size_bytes: 100,
        name: "photo.jpg",
      },
      insertError: { message: "DB exploded", code: "23505" },
    })

    const result = await ensureWorkingCopyExists({ supabase: setup.supabase, projectId })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("db_insert")
      expect(result.code).toBe("23505")
    }
    expect(setup.copyMock).toHaveBeenCalledTimes(1)
    expect(setup.removeMock).toHaveBeenCalledTimes(1)
  })
})
