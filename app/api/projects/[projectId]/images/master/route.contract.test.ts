import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("api contract: master route is immutable", () => {
  it("master delete endpoint returns master_immutable conflict", () => {
    const routePath = path.join(process.cwd(), "app/api/projects/[projectId]/images/master/route.ts")
    const code = fs.readFileSync(routePath, "utf8")
    expect(code).toMatch(/master image is immutable/i)
    expect(code).toMatch(/master_delete_forbidden/)
  })

  it("master by-id delete endpoint returns master_immutable conflict", () => {
    const routePath = path.join(process.cwd(), "app/api/projects/[projectId]/images/master/[imageId]/route.ts")
    const code = fs.readFileSync(routePath, "utf8")
    expect(code).toMatch(/master image is immutable/i)
    expect(code).toMatch(/master_delete_forbidden/)
  })
})

