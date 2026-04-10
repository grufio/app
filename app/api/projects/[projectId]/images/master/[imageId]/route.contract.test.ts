import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("api contract: master by-id delete route invariants", () => {
  it("does not promote master as active fallback", () => {
    const routePath = path.join(process.cwd(), "app/api/projects/[projectId]/images/master/[imageId]/route.ts")
    const code = fs.readFileSync(routePath, "utf8")
    expect(code).not.toMatch(/working\s*\?\?\s*master/)
    expect(code).toMatch(/fallbackStage/)
    expect(code).toMatch(/no_working_copy/)
  })

  it("restricts fallback target kind to working_copy", () => {
    const routePath = path.join(process.cwd(), "app/api/projects/[projectId]/images/master/[imageId]/route.ts")
    const code = fs.readFileSync(routePath, "utf8")
    expect(code).toMatch(/kind:\s*"working_copy"/)
    expect(code).not.toMatch(/kind:\s*"master"/)
  })
})

