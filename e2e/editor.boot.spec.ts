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

async function assertEditorSurfaceVisible(page: import("@playwright/test").Page) {
  const crashed = page.getByText("Editor crashed")
  const canvasRoot = page.getByTestId("editor-canvas-root")
  const artboardPanel = page.getByTestId("editor-artboard-panel")

  // Wait for either the happy path (canvas + at least one panel) or the error boundary.
  await expect(crashed.or(canvasRoot)).toBeVisible()

  if (await crashed.isVisible()) {
    const details = await page.locator("pre").first().textContent().catch(() => null)
    throw new Error(`Editor crashed in E2E.\n\n${details ?? "(no stack available)"}`)
  }

  // Canvas is present; now ensure the sidebar content is also mounted.
  await expect(artboardPanel.or(page.getByLabel("Image width (cm)"))).toBeVisible()
}

test("smoke: /projects/:id loads editor with artboard + canvas", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1", "x-e2e-user": "1" })
  await setupMockRoutes(page, { withImage: true })

  const res = await page.goto(`/projects/${PROJECT_ID}`)
  expect(res?.ok()).toBe(true)
  await assertEditorSurfaceVisible(page)
  await expect(page.locator("canvas").first()).toBeVisible()
})

test("storage: upload → master returns signed URL → editor renders image", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1", "x-e2e-user": "1" })
  await setupMockRoutes(page, { withImage: false })

  const res = await page.goto(`/projects/${PROJECT_ID}`)
  expect(res?.ok()).toBe(true)
  await assertEditorSurfaceVisible(page)

  const upload = await page.evaluate(async (projectId: string) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="#ff3b30"/></svg>`
    const file = new File([new Blob([svg], { type: "image/svg+xml" })], "test.svg", { type: "image/svg+xml" })
    const fd = new FormData()
    fd.append("file", file)
    fd.append("width_px", "20")
    fd.append("height_px", "10")
    fd.append("format", "svg")
    const res = await fetch(`/api/projects/${projectId}/images/master/upload`, { method: "POST", body: fd })
    return { status: res.status, json: await res.json() }
  }, PROJECT_ID)
  expect(upload.status).toBe(200)
  expect(upload.json).toMatchObject({ ok: true })

  const master = await page.evaluate(async (projectId: string) => {
    const res = await fetch(`/api/projects/${projectId}/images/master`)
    return (await res.json()) as unknown
  }, PROJECT_ID)
  expect(master).toMatchObject({ exists: true })
  expect((master as { signedUrl?: string }).signedUrl).toContain("data:image/svg+xml")

  await page.reload()
  await expect(page.getByTestId("editor-canvas-root")).toBeVisible()
  await expect.poll(async () => {
    return await page.evaluate(() => Boolean((globalThis as { __gruf_editor?: { image?: unknown } }).__gruf_editor?.image))
  }).toBe(true)
})

test("image size: setting 100mm survives reload (no drift)", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1", "x-e2e-user": "1" })
  let imageStatePosts = 0
  await setupMockRoutes(page, {
    withImage: true,
    workspace: {
      unit: "mm",
      // 200mm at artboard DPI.
      width_value: 200,
      height_value: 200,
      artboard_dpi: 300,
      width_px_u: unitToPxU("200", "mm", 300).toString(),
      height_px_u: unitToPxU("200", "mm", 300).toString(),
      width_px: 2362,
      height_px: 2362,
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
  await expect(
    page.waitForRequest(
      (req) =>
        req.url().includes(`/api/projects/${PROJECT_ID}/image-state`) &&
        req.method() === "POST",
      { timeout: 250 }
    )
  ).rejects.toThrow()
  expect(imageStatePosts).toBe(1)
})

test("image transform chain: resize + rotate + drag persists", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1", "x-e2e-user": "1" })
  await setupMockRoutes(page, {
    withImage: true,
    workspace: {
      unit: "mm",
      width_value: 200,
      height_value: 200,
      artboard_dpi: 300,
      width_px_u: unitToPxU("200", "mm", 300).toString(),
      height_px_u: unitToPxU("200", "mm", 300).toString(),
      width_px: 2362,
      height_px: 2362,
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
  const beforePerf = await page.evaluate(() => {
    const g = globalThis as {
      __gruf_editor?: { boundsReads?: number; clientRectReads?: number; rafScheduled?: number; rafExecuted?: number }
    }
    return {
      boundsReads: g.__gruf_editor?.boundsReads ?? 0,
      clientRectReads: g.__gruf_editor?.clientRectReads ?? 0,
      rafScheduled: g.__gruf_editor?.rafScheduled ?? 0,
      rafExecuted: g.__gruf_editor?.rafExecuted ?? 0,
    }
  })
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30)
  await page.mouse.up()

  const waitDragSave = page.waitForRequest((req) => isSaveWith(req, { rotation: 90, requirePosition: true }))
  await waitDragSave
  const afterPerf = await page.evaluate(() => {
    const g = globalThis as {
      __gruf_editor?: { boundsReads?: number; clientRectReads?: number; rafScheduled?: number; rafExecuted?: number }
    }
    return {
      boundsReads: g.__gruf_editor?.boundsReads ?? 0,
      clientRectReads: g.__gruf_editor?.clientRectReads ?? 0,
      rafScheduled: g.__gruf_editor?.rafScheduled ?? 0,
      rafExecuted: g.__gruf_editor?.rafExecuted ?? 0,
    }
  })
  expect(afterPerf.boundsReads - beforePerf.boundsReads).toBeLessThanOrEqual(3)
  expect(afterPerf.clientRectReads - beforePerf.clientRectReads).toBeLessThanOrEqual(3)
  expect(afterPerf.rafExecuted - beforePerf.rafExecuted).toBeLessThanOrEqual(6)

  // Pan should not explode bounds reads.
  const beforePan = await page.evaluate(() => {
    const g = globalThis as {
      __gruf_editor?: { boundsReads?: number; clientRectReads?: number; rafExecuted?: number }
    }
    return {
      boundsReads: g.__gruf_editor?.boundsReads ?? 0,
      clientRectReads: g.__gruf_editor?.clientRectReads ?? 0,
      rafExecuted: g.__gruf_editor?.rafExecuted ?? 0,
    }
  })
  await page.mouse.wheel(30, 20)
  await expect.poll(
    async () =>
      await page.evaluate(() => {
        const g = globalThis as { __gruf_editor?: { rafExecuted?: number } }
        return g.__gruf_editor?.rafExecuted ?? 0
      }),
    { timeout: 500 }
  ).toBeGreaterThan(beforePan.rafExecuted)
  const afterPan = await page.evaluate(() => {
    const g = globalThis as {
      __gruf_editor?: { boundsReads?: number; clientRectReads?: number; rafExecuted?: number }
    }
    return {
      boundsReads: g.__gruf_editor?.boundsReads ?? 0,
      clientRectReads: g.__gruf_editor?.clientRectReads ?? 0,
      rafExecuted: g.__gruf_editor?.rafExecuted ?? 0,
    }
  })
  expect(afterPan.boundsReads - beforePan.boundsReads).toBeLessThanOrEqual(2)
  expect(afterPan.clientRectReads - beforePan.clientRectReads).toBeLessThanOrEqual(2)
  expect(afterPan.rafExecuted - beforePan.rafExecuted).toBeLessThanOrEqual(3)

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
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1", "x-e2e-user": "1" })
  let workspaceUpserts = 0

  await setupMockRoutes(page, {
    withImage: true,
    workspace: {
      unit: "mm",
      width_value: 200,
      height_value: 200,
      artboard_dpi: 300,
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
  await expect.poll(() => workspaceUpserts, { timeout: 1_000 }).toBeGreaterThanOrEqual(1)
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
