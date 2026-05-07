/**
 * Unit tests for dashboard row mapping + listing.
 */
import { describe, expect, it } from "vitest"

import type { DashboardProjectRow } from "./dashboard"
import { listDashboardProjects, mapDashboardRow } from "./dashboard"

describe("mapDashboardRow", () => {
  it("maps master thumbnail url when present", () => {
    const row = {
      id: "p1",
      name: "Proj",
      updated_at: null,
      status: "completed",
      project_images: [{ id: "img-1", kind: "master", file_size_bytes: 2048, storage_path: "x", name: "n", format: "png", width_px: 1, height_px: 1 }],
      project_workspace: { width_px: 10, height_px: 20 },
      project_image_state: [],
    } as unknown as DashboardProjectRow
    const signed = new Map<string, string>([["x", "signed"]])
    const vm = mapDashboardRow(row, signed)
    expect(vm.thumbUrl).toBe("signed")
    expect(vm.fileSizeLabel).toBe("2 kb")
    expect(vm.statusLabel).toBe("Completed")
  })

  it("binds transform by image_id (not by role)", () => {
    const row = {
      id: "p1",
      name: "Proj",
      updated_at: null,
      status: "draft",
      project_images: [{ id: "master-a", kind: "master", file_size_bytes: 1024, storage_path: "x", name: "n", format: "png", width_px: 100, height_px: 80 }],
      project_workspace: { width_px: 1200, height_px: 800 },
      project_image_state: [
        {
          role: "master",
          image_id: "other-image",
          x_px_u: "1000000",
          y_px_u: "2000000",
          width_px_u: "3000000",
          height_px_u: "4000000",
          rotation_deg: 45,
        },
        {
          role: "asset",
          image_id: "master-a",
          x_px_u: "5000000",
          y_px_u: "6000000",
          width_px_u: "7000000",
          height_px_u: "8000000",
          rotation_deg: 90,
        },
      ],
    } as unknown as DashboardProjectRow

    const vm = mapDashboardRow(row, new Map([["x", "signed"]]))
    expect(vm.initialImageTransform).toEqual({
      rotationDeg: 90,
      xPxU: 5000000n,
      yPxU: 6000000n,
      widthPxU: 7000000n,
      heightPxU: 8000000n,
    })
  })

  it("falls back to undefined fileSizeLabel when no master image is present", () => {
    const row = {
      id: "p2",
      name: "Empty",
      updated_at: "2026-04-30T12:00:00.000Z",
      status: "draft",
      project_images: [],
      project_workspace: null,
      project_image_state: [],
    } as unknown as DashboardProjectRow
    const vm = mapDashboardRow(row, new Map())
    expect(vm.hasThumbnail).toBe(false)
    expect(vm.fileSizeLabel).toBeUndefined()
    expect(vm.statusLabel).toBeUndefined()
    expect(vm.thumbUrl).toBeNull()
    expect(vm.artboardWidthPx).toBeUndefined()
    expect(vm.artboardHeightPx).toBeUndefined()
    expect(vm.initialImageTransform).toBeNull()
    // dateLabel is locale-formatted; just assert it's a non-empty string.
    expect(typeof vm.dateLabel).toBe("string")
    expect(vm.dateLabel?.length).toBeGreaterThan(0)
  })

  it("returns null transform when no state row matches master image id", () => {
    const row = {
      id: "p1",
      name: "Proj",
      updated_at: null,
      status: "draft",
      project_images: [{ id: "master-a", kind: "master", file_size_bytes: 1024, storage_path: "x", name: "n", format: "png", width_px: 100, height_px: 80 }],
      project_workspace: { width_px: 1200, height_px: 800 },
      project_image_state: [
        {
          role: "master",
          image_id: "other-image",
          x_px_u: "1000000",
          y_px_u: "2000000",
          width_px_u: "3000000",
          height_px_u: "4000000",
          rotation_deg: 45,
        },
      ],
    } as unknown as DashboardProjectRow

    const vm = mapDashboardRow(row, new Map([["x", "signed"]]))
    expect(vm.initialImageTransform).toBeNull()
  })
})

// Migrated to the shared makeMockSupabase factory. Production calls
// `.select(...).order(...).limit(...).returns<...>()` then awaits, so
// the chain has six methods including the terminal awaited via the
// proxy's `.then`.
import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"

function makeFakeSupabase(args: {
  selectResult: { data: DashboardProjectRow[] | null; error: { message: string } | null }
  signResult: {
    data: Array<{ path: string | null; signedUrl: string | null }> | null
    error: { message: string } | null
  }
}) {
  const supabase = makeMockSupabase({
    tables: {
      projects: {
        select: { data: args.selectResult.data, error: args.selectResult.error },
      },
    },
    storage: {
      project_images: {
        createSignedUrls: { data: args.signResult.data, error: args.signResult.error },
      },
    },
  })
  return supabase as unknown as Parameters<typeof listDashboardProjects>[0]
}

describe("listDashboardProjects", () => {
  it("returns the mapped projects with batched signed URLs", async () => {
    const supabase = makeFakeSupabase({
      selectResult: {
        data: [
          {
            id: "p1",
            name: "Proj",
            updated_at: null,
            status: "completed",
            project_images: [
              { id: "img-1", kind: "master", file_size_bytes: 2048, storage_path: "path/a", name: "n", format: "png", width_px: 1, height_px: 1 },
            ],
            project_workspace: { width_px: 10, height_px: 20 },
            project_image_state: [],
          } as unknown as DashboardProjectRow,
        ],
        error: null,
      },
      signResult: {
        data: [{ path: "path/a", signedUrl: "https://signed/a" }],
        error: null,
      },
    })

    const { projects, error } = await listDashboardProjects(supabase)
    expect(error).toBeNull()
    expect(projects).toHaveLength(1)
    expect(projects[0]?.thumbUrl).toBe("https://signed/a")
  })

  it("propagates the select error and returns no projects", async () => {
    const supabase = makeFakeSupabase({
      selectResult: { data: null, error: { message: "rls denied" } },
      signResult: { data: null, error: null },
    })
    const { projects, error } = await listDashboardProjects(supabase)
    expect(error).toBe("rls denied")
    expect(projects).toEqual([])
  })

  it("propagates the signed-url error and returns no projects", async () => {
    const supabase = makeFakeSupabase({
      selectResult: {
        data: [
          {
            id: "p1",
            name: "Proj",
            updated_at: null,
            status: "draft",
            project_images: [
              { id: "img-1", kind: "master", file_size_bytes: 0, storage_path: "path/a", name: "n", format: "png", width_px: 1, height_px: 1 },
            ],
            project_workspace: null,
            project_image_state: [],
          } as unknown as DashboardProjectRow,
        ],
        error: null,
      },
      signResult: { data: null, error: { message: "storage error" } },
    })
    const { projects, error } = await listDashboardProjects(supabase)
    expect(error).toBe("storage error")
    expect(projects).toEqual([])
  })

  it("skips signing when no project has a master storage_path", async () => {
    const supabase = makeFakeSupabase({
      selectResult: {
        data: [
          {
            id: "p1",
            name: "Proj",
            updated_at: null,
            status: "draft",
            project_images: [],
            project_workspace: null,
            project_image_state: [],
          } as unknown as DashboardProjectRow,
        ],
        error: null,
      },
      // signResult unused — createSignedUrls should not be called.
      signResult: { data: null, error: { message: "should-not-be-called" } },
    })
    const { projects, error } = await listDashboardProjects(supabase)
    expect(error).toBeNull()
    expect(projects).toHaveLength(1)
    expect(projects[0]?.thumbUrl).toBeNull()
  })
})

