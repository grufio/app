/**
 * Editor smoke/regression E2E tests.
 *
 * Responsibilities:
 * - Verify the editor boot flow renders canvas and panels.
 * - Regression-test persisted image size behavior across reloads.
 */
import { test, expect, type Request } from "@playwright/test"

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

  const expectedPxU = unitToPxU("100", "mm", 300).toString()

  const isExpectedImageStateSave = (req: Request) => {
    if (!req.url().includes(`/api/projects/${PROJECT_ID}/image-state`)) return false
    if (req.method() !== "POST") return false
    const body = req.postData() ?? ""
    return body.includes(`"width_px_u":"${expectedPxU}"`) && body.includes(`"height_px_u":"${expectedPxU}"`)
  }

  page.on("request", (req) => {
    if (isExpectedImageStateSave(req)) imageStatePosts += 1
  })

  // Wait until the panel is interactive (workspace + image-state finished).
  await expect(w).toBeEnabled()
  await expect(h).toBeEnabled()

  const waitSave = page.waitForRequest((req) => isExpectedImageStateSave(req))

  await w.fill("100")
  await h.fill("100")
  await h.press("Enter")

  const saveReq = await waitSave
  const saveBody = (await saveReq.postDataJSON()) as { width_px_u?: string; height_px_u?: string }
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

test("image transform chain: resize + rotate + drag persists", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1" })
  await setupMockRoutes(page, {
    withImage: true,
    workspace: {
      unit: "mm",
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

  await expect(w).toBeEnabled()
  await expect(h).toBeEnabled()

  const expectedPxU = unitToPxU("120", "mm", 300).toString()
  const isSaveWith = (req: Request, opts?: { rotation?: number; requirePosition?: boolean }) => {
    if (!req.url().includes(`/api/projects/${PROJECT_ID}/image-state`)) return false
    if (req.method() !== "POST") return false
    const body = req.postData() ?? ""
    if (!body.includes(`"width_px_u":"${expectedPxU}"`)) return false
    if (!body.includes(`"height_px_u":"${expectedPxU}"`)) return false
    if (opts?.rotation != null && !body.includes(`"rotation_deg":${opts.rotation}`)) return false
    if (opts?.requirePosition && (!body.includes(`"x_px_u":"`) || !body.includes(`"y_px_u":"`))) return false
    return true
  }

  const waitSizeSave = page.waitForRequest((req) => isSaveWith(req))
  await w.fill("120")
  await h.fill("120")
  await h.press("Enter")
  await waitSizeSave

  const waitRotateSave = page.waitForRequest((req) => isSaveWith(req, { rotation: 90 }))
  await page.getByLabel("Rotate 90°").click()
  await waitRotateSave

  await page.getByLabel("Select (Move Image)").click()
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not visible for drag")
  const beforeBoundsReads = await page.evaluate(() => (globalThis as { __gruf_editor?: { boundsReads?: number } }).__gruf_editor?.boundsReads ?? 0)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30)
  await page.mouse.up()

  const waitDragSave = page.waitForRequest((req) => isSaveWith(req, { rotation: 90, requirePosition: true }))
  await waitDragSave
  const afterBoundsReads = await page.evaluate(() => (globalThis as { __gruf_editor?: { boundsReads?: number } }).__gruf_editor?.boundsReads ?? 0)
  expect(afterBoundsReads - beforeBoundsReads).toBeLessThanOrEqual(3)

  // Pan should not explode bounds reads.
  const beforePanReads = await page.evaluate(() => (globalThis as { __gruf_editor?: { boundsReads?: number } }).__gruf_editor?.boundsReads ?? 0)
  await page.mouse.wheel(30, 20)
  await page.waitForTimeout(50)
  const afterPanReads = await page.evaluate(() => (globalThis as { __gruf_editor?: { boundsReads?: number } }).__gruf_editor?.boundsReads ?? 0)
  expect(afterPanReads - beforePanReads).toBeLessThanOrEqual(2)

  const [imageStateAfterReload] = await Promise.all([
    page.waitForResponse((res) => res.url().includes(`/api/projects/${PROJECT_ID}/image-state`) && res.request().method() === "GET"),
    page.reload(),
  ])

  const imageStateJson = (await imageStateAfterReload.json()) as {
    state?: { width_px_u?: string; height_px_u?: string; x_px_u?: string | null; y_px_u?: string | null; rotation_deg?: number }
  }
  expect(imageStateJson.state?.width_px_u).toBe(expectedPxU)
  expect(imageStateJson.state?.height_px_u).toBe(expectedPxU)
  expect(imageStateJson.state?.rotation_deg).toBe(90)
  expect(imageStateJson.state?.x_px_u).toBeTruthy()
  expect(imageStateJson.state?.y_px_u).toBeTruthy()

  await expect(page.getByLabel("Image width (mm)")).toHaveValue("120")
  await expect(page.getByLabel("Image height (mm)")).toHaveValue("120")
})

test("page background: toggling persists via workspace upsert", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1" })
  let workspaceUpserts = 0

  await setupMockRoutes(page, {
    withImage: true,
    workspace: {
      unit: "mm",
      width_value: 200,
      height_value: 200,
      dpi_x: 300,
      dpi_y: 300,
      width_px: 2362.2047,
      height_px: 2362.2047,
      raster_effects_preset: "high",
      page_bg_enabled: false,
      page_bg_color: "#ffffff",
      page_bg_opacity: 50,
    },
  })

  page.on("request", (req) => {
    if (req.url().includes("/rest/v1/project_workspace") && req.method() === "POST") workspaceUpserts += 1
  })

  await page.goto(`/projects/${PROJECT_ID}`)

  const toggle = page.getByLabel("Page background enabled")
  await expect(toggle).toBeEnabled()
  await toggle.click()

  // Debounced save.
  await page.waitForTimeout(350)
  expect(workspaceUpserts).toBeGreaterThanOrEqual(1)
})

test("auth redirects: protected pages require auth (E2E simulated)", async ({ page }) => {
  // In E2E dev server mode, proxy.ts avoids Supabase network and simulates auth via headers.
  await page.goto("/dashboard")
  await expect(page).toHaveURL(/\/login$/)

  await page.setExtraHTTPHeaders({ "x-e2e-user": "1" })
  await page.goto("/login")
  await expect(page).toHaveURL(/\/dashboard$/)
})
