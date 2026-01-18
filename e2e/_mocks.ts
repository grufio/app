import type { Page } from "@playwright/test"

export const PROJECT_ID = "00000000-0000-0000-0000-000000000001"

export type SetupMockRoutesOpts = {
  withImage: boolean
}

export async function setupMockRoutes(page: Page, opts: SetupMockRoutesOpts) {
  const workspaceRow = {
    project_id: PROJECT_ID,
    unit: "cm",
    width_value: 20,
    height_value: 30,
    dpi_x: 300,
    dpi_y: 300,
    width_px: 2362.2047,
    height_px: 3543.3071,
    raster_effects_preset: "high",
  }

  // Visible inline SVG so Konva renders deterministically.
  const dataImage =
    "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2220%22%20height%3D%2210%22%3E%3Crect%20width%3D%2220%22%20height%3D%2210%22%20fill%3D%22%23ff3b30%22/%3E%3C/svg%3E"

  const masterImagePayload = opts.withImage
    ? {
        exists: true,
        signedUrl: dataImage,
        width_px: 20,
        height_px: 10,
        name: "test.svg",
      }
    : { exists: false }

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
        body: JSON.stringify(masterImagePayload),
      })
    }

    if (url.includes(`/api/projects/${PROJECT_ID}/images/master/exists`)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ exists: Boolean(opts.withImage) }),
      })
    }

    // Internal API: image-state (not needed for MVP smoke)
    if (url.includes(`/api/projects/${PROJECT_ID}/image-state`)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ exists: false }),
      })
    }

    return route.fallback()
  })
}
