import { test, expect } from "@playwright/test"

import { unitToPxU } from "../lib/editor/units"
import { PROJECT_ID, setupMockRoutes } from "./_mocks"

test("smoke: /projects/:id loads editor with artboard + canvas", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1" })
  await setupMockRoutes(page, { withImage: true })

  await page.goto(`/projects/${PROJECT_ID}`)
  await expect(page.getByTestId("editor-artboard-panel")).toBeVisible()
  await expect(page.getByTestId("editor-canvas-root")).toBeVisible()
  await expect(page.locator("canvas").first()).toBeVisible()
})

test("image size: setting 100mm survives reload (no drift)", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1" })
  let imageStatePosts = 0
  page.on("request", (req) => {
    if (req.url().includes(`/api/projects/${PROJECT_ID}/image-state`) && req.method() === "POST") {
      imageStatePosts += 1
    }
  })
  await setupMockRoutes(page, {
    withImage: true,
    workspace: {
      unit: "mm",
      // 200mm @300dpi ~= 2362.2047 px (keep existing px so artboard is valid).
      width_value: 200,
      height_value: 200,
      dpi_x: 300,
      dpi_y: 300,
      width_px: 2362.2047,
      height_px: 2362.2047,
      raster_effects_preset: "high",
    },
  })

  await page.goto(`/projects/${PROJECT_ID}`)

  const w = page.getByLabel("Image width (mm)")
  const h = page.getByLabel("Image height (mm)")

  // Wait until the panel is interactive (workspace + image-state finished).
  await expect(w).toBeEnabled()
  await expect(h).toBeEnabled()

  const waitSave = page.waitForRequest(
    (req) => req.url().includes(`/api/projects/${PROJECT_ID}/image-state`) && req.method() === "POST"
  )

  await w.fill("100")
  await h.fill("100")
  await h.press("Enter")

  const saveReq = await waitSave
  const saveBody = (await saveReq.postDataJSON()) as { width_px_u?: string; height_px_u?: string }
  const expectedPxU = unitToPxU("100", "mm", 300).toString()
  expect(saveBody.width_px_u).toBe(expectedPxU)
  expect(saveBody.height_px_u).toBe(expectedPxU)
  expect(imageStatePosts).toBe(1)

  const [imageStateAfterReload] = await Promise.all([
    page.waitForResponse((res) => res.url().includes(`/api/projects/${PROJECT_ID}/image-state`) && res.request().method() === "GET"),
    page.reload(),
  ])

  const imageStateJson = (await imageStateAfterReload.json()) as unknown
  expect(imageStateJson).toMatchObject({ exists: true })
  const state = (imageStateJson as { state?: { width_px_u?: string; height_px_u?: string } }).state
  expect(state?.width_px_u).toBe(expectedPxU)
  expect(state?.height_px_u).toBe(expectedPxU)

  await expect(page.getByLabel("Image width (mm)")).toHaveValue("100")
  await expect(page.getByLabel("Image height (mm)")).toHaveValue("100")

  // Unit toggle should not trigger image-state save.
  await page.getByLabel("Artboard unit").click()
  await page.getByRole("option", { name: "cm" }).click()
  await page.waitForTimeout(250)
  expect(imageStatePosts).toBe(1)
})
