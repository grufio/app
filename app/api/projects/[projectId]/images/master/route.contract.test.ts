import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("api contract: master route supports cascade delete", () => {
  it("master upload route uses only single dpi field", () => {
    const routePath = path.join(process.cwd(), "app/api/projects/[projectId]/images/master/upload/route.ts")
    const code = fs.readFileSync(routePath, "utf8")
    expect(code).toMatch(/form\.get\("dpi"\)/)
    expect(code).not.toMatch(/form\.get\("dpi_x"\)/)
    expect(code).not.toMatch(/form\.get\("dpi_y"\)/)
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
  })
})

