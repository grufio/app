/**
 * Unit tests for activateProjectImage.
 *
 * These tests focus on the gate paths that don't require a real
 * Supabase environment — failed lookups, lock conflicts, missing
 * workspace, invalid placements. The Supabase client is stubbed via
 * vi.mock; we only exercise the orchestration logic in this file.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

vi.mock("@/lib/supabase/project-images", () => ({
  getActiveProjectImageLockRow: vi.fn(),
  getProjectWorkspacePlacementRow: vi.fn(),
  setActiveProjectImageState: vi.fn(),
}))

import {
  getActiveProjectImageLockRow,
  getProjectWorkspacePlacementRow,
  setActiveProjectImageState,
} from "@/lib/supabase/project-images"
import { activateProjectImage } from "./activate-project-image"

const supabase = {} as SupabaseClient

const baseArgs = {
  supabase,
  projectId: "p1",
  imageId: "img1",
  widthPx: 1000,
  heightPx: 800,
  imageDpi: 300,
}

beforeEach(() => {
  vi.mocked(getActiveProjectImageLockRow).mockReset()
  vi.mocked(getProjectWorkspacePlacementRow).mockReset()
  vi.mocked(setActiveProjectImageState).mockReset()
})

describe("activateProjectImage", () => {
  it("returns active_switch error when lock-row lookup fails", async () => {
    vi.mocked(getActiveProjectImageLockRow).mockResolvedValue({
      row: null,
      error: { reason: "boom", code: "lock_lookup_failed" },
    })

    const out = await activateProjectImage(baseArgs)
    expect(out).toEqual({
      ok: false,
      status: 400,
      stage: "active_switch",
      reason: "boom",
      code: "lock_lookup_failed",
    })
  })

  it("returns lock_conflict when a different image is already locked active", async () => {
    vi.mocked(getActiveProjectImageLockRow).mockResolvedValue({
      row: { id: "other", is_locked: true },
      error: null,
    })

    const out = await activateProjectImage(baseArgs)
    expect(out).toEqual({
      ok: false,
      status: 409,
      stage: "lock_conflict",
      reason: "Active image is locked",
      code: "image_locked",
    })
  })

  it("returns active_switch when workspace lookup fails", async () => {
    vi.mocked(getActiveProjectImageLockRow).mockResolvedValue({ row: null, error: null })
    vi.mocked(getProjectWorkspacePlacementRow).mockResolvedValue({
      row: null,
      error: { reason: "no workspace", code: "ws_missing" },
    })

    const out = await activateProjectImage(baseArgs)
    expect(out).toEqual({
      ok: false,
      status: 400,
      stage: "active_switch",
      reason: "no workspace",
      code: "ws_missing",
    })
  })

  it("returns active_switch when workspace size is missing/invalid", async () => {
    vi.mocked(getActiveProjectImageLockRow).mockResolvedValue({ row: null, error: null })
    vi.mocked(getProjectWorkspacePlacementRow).mockResolvedValue({
      row: {
        width_px_u: null,
        height_px_u: null,
        width_px: 0,
        height_px: 0,
        output_dpi: 300,
      },
      error: null,
    })

    const out = await activateProjectImage(baseArgs)
    expect(out).toEqual({
      ok: false,
      status: 400,
      stage: "active_switch",
      reason: "Workspace size missing or invalid",
    })
  })

  it("delegates to setActiveProjectImageState on the happy path", async () => {
    vi.mocked(getActiveProjectImageLockRow).mockResolvedValue({ row: null, error: null })
    vi.mocked(getProjectWorkspacePlacementRow).mockResolvedValue({
      row: {
        width_px_u: "1000000000",
        height_px_u: "800000000",
        width_px: 1000,
        height_px: 800,
        output_dpi: 300,
      },
      error: null,
    })
    vi.mocked(setActiveProjectImageState).mockResolvedValue({ ok: true })

    const out = await activateProjectImage(baseArgs)
    expect(out).toEqual({ ok: true })
    expect(vi.mocked(setActiveProjectImageState)).toHaveBeenCalledOnce()
  })
})
