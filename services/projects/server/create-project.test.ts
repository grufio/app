import { describe, expect, it } from "vitest"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import type { Unit } from "@/lib/editor/units"
import { type CreateProjectInput, createProjectWithWorkspace } from "./create-project"

const OWNER = "0a0a0a0a-0000-4000-8000-000000000000"
const PID = "11111111-1111-4111-8111-111111111111"
const validInput: CreateProjectInput = { ownerId: OWNER, name: "My Project", unit: "mm", width_value: 210, height_value: 297 }

type Row = Record<string, unknown>

describe("createProjectWithWorkspace", () => {
  it("rejects an invalid unit", async () => {
    const res = await createProjectWithWorkspace(makeMockSupabase(), { ...validInput, unit: "in" as Unit })
    expect(res).toMatchObject({ ok: false, stage: "validation" })
  })

  it("rejects non-positive or non-finite dimensions", async () => {
    const s = makeMockSupabase()
    expect(await createProjectWithWorkspace(s, { ...validInput, width_value: 0 })).toMatchObject({ ok: false, stage: "validation" })
    expect(await createProjectWithWorkspace(s, { ...validInput, height_value: -5 })).toMatchObject({ ok: false, stage: "validation" })
    expect(await createProjectWithWorkspace(s, { ...validInput, width_value: Number.NaN })).toMatchObject({ ok: false, stage: "validation" })
  })

  it("returns insert_project when the project insert fails", async () => {
    const s = makeMockSupabase({ tables: { projects: { insert: { data: null, error: { message: "boom" } } } } })
    expect(await createProjectWithWorkspace(s, validInput)).toMatchObject({ ok: false, stage: "insert_project" })
  })

  it("rolls back the project when the workspace insert fails", async () => {
    let deletedProjects = false
    const s = makeMockSupabase({
      tables: {
        projects: { insert: { data: { id: PID } }, delete: { error: null, onCall: () => { deletedProjects = true } } },
        project_workspace: { insert: { error: { message: "ws boom" } } },
      },
    })
    expect(await createProjectWithWorkspace(s, validInput)).toMatchObject({ ok: false, stage: "insert_workspace" })
    expect(deletedProjects).toBe(true)
  })

  it("creates project + workspace with computed px columns and returns the id", async () => {
    const captured: { project: Row | null; ws: Row | null } = { project: null, ws: null }
    const s = makeMockSupabase({
      tables: {
        projects: { insert: { data: { id: PID }, onCall: (c) => { captured.project = c.opArgs[0] as Row } } },
        project_workspace: { insert: { error: null, onCall: (c) => { captured.ws = c.opArgs[0] as Row } } },
      },
    })
    const res = await createProjectWithWorkspace(s, validInput)
    expect(res).toEqual({ ok: true, projectId: PID })
    expect(captured.project).toMatchObject({ owner_id: OWNER, name: "My Project" })
    expect(captured.ws).toMatchObject({ project_id: PID, unit: "mm", width_value: 210, height_value: 297 })
    expect(typeof captured.ws?.width_px_u).toBe("string")
    expect(typeof captured.ws?.width_px).toBe("number")
  })

  it("trims the name and defaults blank names to 'Untitled'", async () => {
    const captured: { project: Row | null } = { project: null }
    const s = makeMockSupabase({
      tables: {
        projects: { insert: { data: { id: PID }, onCall: (c) => { captured.project = c.opArgs[0] as Row } } },
        project_workspace: { insert: { error: null } },
      },
    })
    await createProjectWithWorkspace(s, { ...validInput, name: "   " })
    expect(captured.project?.name).toBe("Untitled")
    await createProjectWithWorkspace(s, { ...validInput, name: "  Trimmed  " })
    expect(captured.project?.name).toBe("Trimmed")
  })
})
