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

  it("master GET endpoint emits a kind='master' signed URL distinct from the active URL", () => {
    // Regression guard: PR #354 added the Image/Artboard section
    // override (`showRawMaster` in pickCanvasImage) but wired it from
    // `signedUrl` — which signs the `is_active=true` row, not the
    // `kind='master'` row. The two URLs only coincide pre-filter
    // (shared storage_path); once a filter creates a derived row the
    // active URL is the filter tip and the override degrades to a
    // no-op. The route must therefore emit a separate `masterSignedUrl`
    // signed from the master row's own storage_path so the client can
    // surface the raw master regardless of which row is active.
    const routePath = path.join(process.cwd(), "app/api/projects/[projectId]/images/master/route.ts")
    const code = fs.readFileSync(routePath, "utf8")
    expect(code).toMatch(/masterSignedUrl/)
    // The master-row query must include storage_path/storage_bucket
    // (otherwise there's no master URL to sign).
    expect(code).toMatch(/kind['"]?,\s*['"]master['"]/)
    expect(code).toMatch(/restoreBase[?.]?\.?storage_path/)
    // The cache must hold both URLs in one entry so they can never
    // drift in expiry (one fresh, one stale).
    expect(code).toMatch(/masterUrl/)
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

