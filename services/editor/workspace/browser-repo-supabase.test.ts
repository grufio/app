import { describe, expect, it } from "vitest"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import { updateWorkspaceDpi, updateWorkspaceGeometry } from "./browser-repo-supabase"

function makeSupabaseSpy() {
  // Track whether update() was reached. The whole point of these tests
  // is that the validation guards return BEFORE any DB write.
  const updateCalls: number[] = []
  const supabase = makeMockSupabase({
    tables: {
      project_workspace: {
        update: {
          data: null,
          error: null,
          onCall: () => updateCalls.push(updateCalls.length + 1),
        },
        select: { data: null, error: null },
      },
    },
  })
  return { supabase, updateCalls }
}

describe("workspace browser repo guards", () => {
  it("updateWorkspaceDpi rejects geometry fields in payload", async () => {
    const { supabase, updateCalls } = makeSupabaseSpy()

    const res = await updateWorkspaceDpi(supabase, {
      projectId: "p",
      outputDpi: 300,
      rasterEffectsPreset: "high",
      widthPxU: "123", // forbidden
    } as unknown as Parameters<typeof updateWorkspaceDpi>[1])

    expect(res.row).toBe(null)
    expect(res.error).toContain("invalid_payload_for_dpi_update")
    expect(updateCalls).toHaveLength(0)
  })

  it("updateWorkspaceGeometry rejects dpi/output fields in payload", async () => {
    const { supabase, updateCalls } = makeSupabaseSpy()

    const res = await updateWorkspaceGeometry(supabase, {
      projectId: "p",
      unit: "mm",
      widthValue: 200,
      heightValue: 100,
      widthPxU: "200000000",
      heightPxU: "100000000",
      widthPx: 200,
      heightPx: 100,
      outputDpi: 300, // forbidden
    } as unknown as Parameters<typeof updateWorkspaceGeometry>[1])

    expect(res.row).toBe(null)
    expect(res.error).toContain("invalid_payload_for_geometry_update")
    expect(updateCalls).toHaveLength(0)
  })
})
