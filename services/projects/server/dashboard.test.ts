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
      project_images: [{ role: "master", file_size_bytes: 2048, storage_path: "x", name: "n", format: "png", width_px: 1, height_px: 1 }],
      project_workspace: { width_px: 10, height_px: 20 },
      project_image_state: [],
    } as unknown as DashboardProjectRow
    const signed = new Map<string, string>([["x", "signed"]])
    const vm = mapDashboardRow(row, signed)
    expect(vm.thumbUrl).toBe("signed")
    expect(vm.fileSizeLabel).toBe("2 kb")
    expect(vm.statusLabel).toBe("Completed")
  })
})

