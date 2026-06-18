import { describe, expect, it } from "vitest"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import { getMasterImageForEditor } from "./master-image"

const PROJECT_ID = "project-id"
const MASTER_ID = "master-id"
const WORKING_COPY_ID = "working-copy-id"
const FILTER_WC_ID = "filter-working-copy-id"

function row(over: Record<string, unknown>) {
  return {
    storage_bucket: "project_images",
    storage_path: `projects/${PROJECT_ID}/images/${over.id}`,
    format: "png",
    width_px: 100,
    height_px: 100,
    file_size_bytes: 10,
    dpi: 72,
    name: "image",
    created_at: "2026-05-22T00:00:00Z",
    updated_at: "2026-05-22T00:00:00Z",
    ...over,
  }
}

describe("getMasterImageForEditor — stable master identity", () => {
  // Regression guard for the reset-cascade bug: the editor's "primary
  // image" id (`masterImage.id`) tracks the active editor target (which
  // becomes a filter_working_copy after a filter apply), but the stable
  // identity used as the client reset key (`masterRowId`) must remain the
  // immutable kind='master' row id. If these two ever collapse, applying
  // a filter/crop/trace flips the reset key and discards the user's
  // persisted display transform.
  it("returns masterRowId = the kind='master' id, distinct from the active editor-target id", async () => {
    const supabase = makeMockSupabase({
      tables: {
        project_images: {
          select: (ctx) => {
            const isMasterQuery = ctx.args.some(
              (a) => Array.isArray(a) && a[0] === "kind" && a[1] === "master",
            )
            if (isMasterQuery) {
              // restore_base / master-row lookup (maybeSingle)
              return { data: { id: MASTER_ID, width_px: 100, height_px: 100, dpi: 72 } }
            }
            // resolveEditorTargetImageRows: all non-deleted rows (array)
            return {
              data: [
                row({ id: MASTER_ID, kind: "master", source_image_id: null }),
                row({ id: WORKING_COPY_ID, kind: "working_copy", source_image_id: MASTER_ID }),
                row({ id: FILTER_WC_ID, kind: "filter_working_copy", source_image_id: WORKING_COPY_ID }),
              ],
            }
          },
        },
      },
      storage: {
        project_images: {
          createSignedUrl: { data: { signedUrl: "https://signed.test/url" } },
        },
      },
    })

    const { masterImage, error } = await getMasterImageForEditor(supabase, PROJECT_ID)

    expect(error).toBeNull()
    expect(masterImage).not.toBeNull()
    // Active editor target = the filter chain tip (filter_working_copy).
    expect(masterImage?.id).toBe(FILTER_WC_ID)
    // Stable reset-key identity = the immutable master row — decoupled.
    expect(masterImage?.masterRowId).toBe(MASTER_ID)
    expect(masterImage?.masterRowId).not.toBe(masterImage?.id)
  })
})

describe("getMasterImageForEditor — masterSignedUrl surfaces the raw master", () => {
  // Regression guard for the bug where `masterImage.signedUrl` was the
  // ACTIVE row's URL (filter tip after a filter is applied), not the
  // master's. The shell wired that into `pickCanvasImage`'s
  // `showRawMaster` swap, which then became a no-op when a filter
  // existed → user saw the filter on the Image / Artboard section.
  // `masterSignedUrl` must be signed from the `kind='master'` row's
  // own storage_path, distinct from `signedUrl` whenever the active
  // row diverges (= a filter exists).

  it("signs the kind='master' row separately when active diverges (filter applied)", async () => {
    const supabase = makeMockSupabase({
      tables: {
        project_images: {
          select: (ctx) => {
            const isMasterQuery = ctx.args.some(
              (a) => Array.isArray(a) && a[0] === "kind" && a[1] === "master",
            )
            if (isMasterQuery) {
              return {
                data: {
                  id: MASTER_ID,
                  width_px: 100,
                  height_px: 100,
                  dpi: 72,
                  storage_path: `projects/${PROJECT_ID}/images/${MASTER_ID}`,
                  storage_bucket: "project_images",
                },
              }
            }
            // After filter: active row has its OWN storage_path.
            return {
              data: [
                row({ id: MASTER_ID, kind: "master", source_image_id: null }),
                row({
                  id: FILTER_WC_ID,
                  kind: "filter_working_copy",
                  source_image_id: WORKING_COPY_ID,
                  storage_path: `projects/${PROJECT_ID}/images/${FILTER_WC_ID}`,
                }),
              ],
            }
          },
        },
      },
      storage: {
        project_images: {
          createSignedUrl: (path: string) => ({
            data: { signedUrl: `https://signed.test/${path}` },
          }),
        },
      },
    })

    const { masterImage, error } = await getMasterImageForEditor(supabase, PROJECT_ID)

    expect(error).toBeNull()
    expect(masterImage).not.toBeNull()
    expect(masterImage?.signedUrl).toContain(FILTER_WC_ID)
    expect(masterImage?.masterSignedUrl).toContain(MASTER_ID)
    expect(masterImage?.masterSignedUrl).not.toBe(masterImage?.signedUrl)
  })

  it("reuses the active URL when active and master share storage_path (no filter)", async () => {
    // Pre-filter, working_copy shares master.storage_path (migration
    // step 2 backfill). The helper avoids a redundant second sign call
    // and returns the same URL for both fields.
    const SHARED_PATH = `projects/${PROJECT_ID}/images/${MASTER_ID}`
    const supabase = makeMockSupabase({
      tables: {
        project_images: {
          select: (ctx) => {
            const isMasterQuery = ctx.args.some(
              (a) => Array.isArray(a) && a[0] === "kind" && a[1] === "master",
            )
            if (isMasterQuery) {
              return {
                data: {
                  id: MASTER_ID,
                  width_px: 100,
                  height_px: 100,
                  dpi: 72,
                  storage_path: SHARED_PATH,
                  storage_bucket: "project_images",
                },
              }
            }
            return {
              data: [
                row({ id: MASTER_ID, kind: "master", source_image_id: null }),
                row({
                  id: WORKING_COPY_ID,
                  kind: "working_copy",
                  source_image_id: MASTER_ID,
                  storage_path: SHARED_PATH,
                }),
              ],
            }
          },
        },
      },
      storage: {
        project_images: {
          createSignedUrl: { data: { signedUrl: `https://signed.test/${SHARED_PATH}` } },
        },
      },
    })

    const { masterImage } = await getMasterImageForEditor(supabase, PROJECT_ID)
    expect(masterImage?.signedUrl).toBe(masterImage?.masterSignedUrl)
  })

  it("partial-boot: returns empty masterSignedUrl when master-row sign fails (active still works)", async () => {
    const supabase = makeMockSupabase({
      tables: {
        project_images: {
          select: (ctx) => {
            const isMasterQuery = ctx.args.some(
              (a) => Array.isArray(a) && a[0] === "kind" && a[1] === "master",
            )
            if (isMasterQuery) {
              return {
                data: {
                  id: MASTER_ID,
                  width_px: 100,
                  height_px: 100,
                  dpi: 72,
                  storage_path: `projects/${PROJECT_ID}/images/${MASTER_ID}`,
                  storage_bucket: "project_images",
                },
              }
            }
            return {
              data: [
                row({ id: MASTER_ID, kind: "master", source_image_id: null }),
                row({
                  id: FILTER_WC_ID,
                  kind: "filter_working_copy",
                  source_image_id: WORKING_COPY_ID,
                  storage_path: `projects/${PROJECT_ID}/images/${FILTER_WC_ID}`,
                }),
              ],
            }
          },
        },
      },
      storage: {
        project_images: {
          // Active path signs OK, master path comes back error.
          createSignedUrl: (path: string) =>
            path.includes(MASTER_ID)
              ? { data: null, error: { message: "storage policy denied" } }
              : { data: { signedUrl: `https://signed.test/${path}` } },
        },
      },
    })

    const { masterImage, error } = await getMasterImageForEditor(supabase, PROJECT_ID)
    expect(error).toBeNull()
    expect(masterImage).not.toBeNull()
    expect(masterImage?.signedUrl).toContain(FILTER_WC_ID)
    // Graceful degrade — pickCanvasImage falls back to working copy
    // when masterSignedUrl is falsy. Same visual as pre-PR-#354.
    expect(masterImage?.masterSignedUrl).toBe("")
  })
})
