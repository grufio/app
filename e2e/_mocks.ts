/**
 * Playwright network mocks for E2E.
 *
 * Responsibilities:
 * - Stub Supabase PostgREST + Storage calls for editor flows.
 * - Provide deterministic test fixtures (project/workspace/image/image-state).
 */
import type { Page } from "@playwright/test"

import { clampPx, pxUToPxNumber, unitToPxU } from "@/lib/editor/units"

// Must match `isUuid()` (UUID v1-5); use a deterministic v4-style UUID for tests.
export const PROJECT_ID = "00000000-0000-4000-8000-000000000001"

export type SetupMockRoutesOpts = {
  withImage: boolean
  workspace?: Partial<{
    unit: "mm" | "cm" | "pt" | "px"
    width_value: number
    height_value: number
    artboard_dpi: number
    width_px_u: string
    height_px_u: string
    width_px: number
    height_px: number
    raster_effects_preset: "high" | "medium" | "low" | "custom" | null
    page_bg_enabled: boolean
    page_bg_color: string
    page_bg_opacity: number
  }>
  imageState?: { exists: false } | { exists: true; state: ImageStateRow }
}

type ImageStateRow = {
  x_px_u?: string | null
  y_px_u?: string | null
  width_px_u?: string | null
  height_px_u?: string | null
  rotation_deg: number
}

export async function setupMockRoutes(page: Page, opts: SetupMockRoutesOpts) {
  const defaultWorkspaceRow = {
    project_id: PROJECT_ID,
    unit: "cm",
    width_value: 20,
    height_value: 30,
    artboard_dpi: 300,
    // canonical µpx (strings)
    width_px_u: unitToPxU("20", "cm", 300).toString(),
    height_px_u: unitToPxU("30", "cm", 300).toString(),
    // cached integer px
    width_px: clampPx(pxUToPxNumber(unitToPxU("20", "cm", 300))),
    height_px: clampPx(pxUToPxNumber(unitToPxU("30", "cm", 300))),
    raster_effects_preset: "high",
    page_bg_enabled: false,
    page_bg_color: "#ffffff",
    page_bg_opacity: 50,
  }
  const workspaceRow = { ...defaultWorkspaceRow, ...(opts.workspace ?? {}) }

  // Visible inline SVG so Konva renders deterministically.
  const dataImage =
    "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2220%22%20height%3D%2210%22%3E%3Crect%20width%3D%2220%22%20height%3D%2210%22%20fill%3D%22%23ff3b30%22/%3E%3C/svg%3E"

  let hasImage = Boolean(opts.withImage)
  const masterImagePayload = () =>
    hasImage
      ? {
          exists: true,
          signedUrl: dataImage,
          width_px: 20,
          height_px: 10,
          name: "test.svg",
        }
      : { exists: false }

  let imageState: ImageStateRow | null = opts.imageState && opts.imageState.exists ? opts.imageState.state : null

  page.route("**/*", async (route) => {
    const url = route.request().url()

    // Supabase PostgREST: projects
    if (url.includes("/rest/v1/projects")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ name: "Test Project" }),
      })
    }

    // Supabase PostgREST: project_workspace
    if (url.includes("/rest/v1/project_workspace")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(workspaceRow),
      })
    }

    // Internal API: master image exists + signed URL
    if (url.includes(`/api/projects/${PROJECT_ID}/images/master`) && !url.includes("/exists") && !url.includes("/upload")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(masterImagePayload()),
      })
    }

    if (url.includes(`/api/projects/${PROJECT_ID}/images/master/exists`)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ exists: hasImage }),
      })
    }

    // Internal API: upload master image (mocked)
    if (url.includes(`/api/projects/${PROJECT_ID}/images/master/upload`)) {
      const req = route.request()
      if (req.method() === "POST") {
        hasImage = true
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, storage_path: `projects/${PROJECT_ID}/master/mock-upload.svg` }),
        })
      }
      return route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ error: "Method not allowed" }) })
    }

    // Internal API: image-state (not needed for MVP smoke)
    if (url.includes(`/api/projects/${PROJECT_ID}/image-state`)) {
      const req = route.request()
      if (req.method() === "POST") {
        try {
          const body = (await req.postDataJSON()) as Partial<ImageStateRow>
          imageState = {
            x_px_u: body.x_px_u ?? null,
            y_px_u: body.y_px_u ?? null,
            width_px_u: body.width_px_u ?? null,
            height_px_u: body.height_px_u ?? null,
            rotation_deg: Number(body.rotation_deg ?? 0),
          }
        } catch {
          // ignore bad body
        }
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
      }

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(imageState ? { exists: true, state: imageState } : { exists: false }),
      })
    }

    return route.fallback()
  })
}
