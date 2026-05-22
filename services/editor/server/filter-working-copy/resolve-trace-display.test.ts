import { describe, expect, it } from "vitest"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import { resolveTraceDisplay } from "./resolve-trace-display"

const PROJECT = "project-1"
const imageRow = {
  id: "trace-out-1",
  storage_bucket: "project_images",
  storage_path: "projects/p/trace.png",
  width_px: 640,
  height_px: 480,
  source_image_id: "wc-1",
  name: "Photo (pixelate)",
}

describe("resolveTraceDisplay", () => {
  it("returns null when the project has no trace row", async () => {
    const supabase = makeMockSupabase({ tables: { project_image_trace: { select: { data: null } } } })
    expect(await resolveTraceDisplay({ supabase, projectId: PROJECT })).toBeNull()
  })

  it("returns null when the trace points at a missing/tombstoned image", async () => {
    const supabase = makeMockSupabase({
      tables: {
        project_image_trace: { select: { data: { output_image_id: "trace-out-1" } } },
        project_images: { select: { data: null } },
      },
    })
    expect(await resolveTraceDisplay({ supabase, projectId: PROJECT })).toBeNull()
  })

  it("returns null when signing the URL fails", async () => {
    const supabase = makeMockSupabase({
      tables: {
        project_image_trace: { select: { data: { output_image_id: "trace-out-1" } } },
        project_images: { select: { data: imageRow } },
      },
      storage: { project_images: { createSignedUrl: { data: null } } },
    })
    expect(await resolveTraceDisplay({ supabase, projectId: PROJECT })).toBeNull()
  })

  it("resolves the trace output into a filter-result display payload", async () => {
    const supabase = makeMockSupabase({
      tables: {
        project_image_trace: { select: { data: { output_image_id: "trace-out-1" } } },
        project_images: { select: { data: imageRow } },
      },
      storage: { project_images: { createSignedUrl: { data: { signedUrl: "https://signed.test/trace.png" } } } },
    })
    expect(await resolveTraceDisplay({ supabase, projectId: PROJECT })).toEqual({
      id: "trace-out-1",
      storagePath: "projects/p/trace.png",
      widthPx: 640,
      heightPx: 480,
      signedUrl: "https://signed.test/trace.png",
      sourceImageId: "wc-1",
      name: "Photo (pixelate)",
      isFilterResult: true,
    })
  })
})
