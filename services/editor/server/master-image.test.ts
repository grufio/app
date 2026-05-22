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
    is_locked: false,
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
