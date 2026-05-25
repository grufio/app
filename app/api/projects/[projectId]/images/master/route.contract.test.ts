import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("api contract: master route supports cascade delete", () => {
  it("master list endpoint returns typed display-target metadata", () => {
    const routePath = path.join(process.cwd(), "app/api/projects/[projectId]/images/master/list/route.ts")
    const code = fs.readFileSync(routePath, "utf8")
    expect(code).toMatch(/display_target/)
    expect(code).toMatch(/active_image_id/)
    expect(code).toMatch(/kind/)
    expect(code).toMatch(/deletable/)
    expect(code).toMatch(/reason/)
    expect(code).toMatch(/fallback_target/)
  })

  it("master upload route reads no client dimensions/DPI (server derives them via sharp)", () => {
    const routePath = path.join(process.cwd(), "app/api/projects/[projectId]/images/master/upload/route.ts")
    const code = fs.readFileSync(routePath, "utf8")
    // Width/height/DPI are read server-side from the file bytes (sharp) in
    // the upload service — the route must NOT parse them from the form.
    expect(code).not.toMatch(/form\.get\("dpi"\)/)
    expect(code).not.toMatch(/form\.get\("width_px"\)/)
    expect(code).not.toMatch(/form\.get\("height_px"\)/)
  })

  it("active master delete endpoint documents transitive cleanup", () => {
    const routePath = path.join(process.cwd(), "app/api/projects/[projectId]/images/master/route.ts")
    const code = fs.readFileSync(routePath, "utf8")
    expect(code).toMatch(/transitively derived images/i)
    expect(code).toMatch(/delete\(\)/i)
  })

  it("master by-id delete endpoint returns delete metadata", () => {
    const routePath = path.join(process.cwd(), "app/api/projects/[projectId]/images/master/[imageId]/route.ts")
    const code = fs.readFileSync(routePath, "utf8")
    expect(code).toMatch(/transitiveCount/)
    expect(code).toMatch(/deleted/)
    expect(code).toMatch(/stale_selection/)
    expect(code).toMatch(/master_immutable/)
    expect(code).toMatch(/no_working_copy/)
  })
})

