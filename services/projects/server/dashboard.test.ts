/**
 * Unit tests for dashboard row mapping.
 */
import { describe, expect, it } from "vitest"

import type { DashboardProjectRow } from "./dashboard"
import { mapDashboardRow } from "./dashboard"

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

