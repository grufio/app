import { test, expect } from "@playwright/test"

const PROJECT_ID = "00000000-0000-0000-0000-000000000001"

function mockSupabaseAndApi(page: import("@playwright/test").Page, opts: { withImage: boolean }) {
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

  // A tiny 1x1 png data URL (works with window.Image).
  const dataPng =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6qv0kAAAAASUVORK5CYII="

  const masterImagePayload = opts.withImage
    ? {
        exists: true,
        signedUrl: dataPng,
        width_px: 1000,
        height_px: 500,
        name: "test.png",
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
    if (url.endsWith(`/api/projects/${PROJECT_ID}/images/master`)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(masterImagePayload),
      })
    }

    if (url.endsWith(`/api/projects/${PROJECT_ID}/images/master/exists`)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ exists: Boolean(opts.withImage) }),
      })
    }

    // Internal API: image-state (persisted transform)
    if (url.endsWith(`/api/projects/${PROJECT_ID}/image-state`)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ exists: false }),
      })
    }

    return route.fallback()
  })
}

test("editor loads without an image (uploader shown)", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1" })
  mockSupabaseAndApi(page, { withImage: false })
  await page.goto(`/projects/${PROJECT_ID}`)

  await expect(page.getByText("Artboard")).toBeVisible()
  await expect(page.getByText("Upload master image")).toBeVisible()
})

test("editor loads with an image (konva canvas present)", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1" })
  mockSupabaseAndApi(page, { withImage: true })
  await page.goto(`/projects/${PROJECT_ID}`)

  await expect(page.getByText("Artboard")).toBeVisible()
  // react-konva renders a <canvas> inside the stage container
  await expect(page.locator("canvas").first()).toBeVisible()
})

