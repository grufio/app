import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("api contract: master list route ui targets", () => {
  it("filters out master kind from ui items", () => {
    const routePath = path.join(process.cwd(), "app/api/projects/[projectId]/images/master/list/route.ts")
    const code = fs.readFileSync(routePath, "utf8")
    expect(code).toMatch(/resolveImageKind\(row\) !== "master"/)
    expect(code).toMatch(/items:\s*uiItems/)
  })

  it("never queries list items with master-only filter", () => {
    const routePath = path.join(process.cwd(), "app/api/projects/[projectId]/images/master/list/route.ts")
    const code = fs.readFileSync(routePath, "utf8")
    expect(code).not.toMatch(/\.eq\("kind", "master"\)/)
    expect(code).toMatch(/display_target/)
  })

  it("uses centralized editor target resolver", () => {
    const routePath = path.join(process.cwd(), "app/api/projects/[projectId]/images/master/list/route.ts")
    const code = fs.readFileSync(routePath, "utf8")
    expect(code).toMatch(/resolveEditorTargetImageRows/)
    expect(code).not.toMatch(/uiTargets/)
  })
})
