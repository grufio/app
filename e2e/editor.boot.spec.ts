/**
 * Editor smoke/regression E2E tests.
 *
 * Responsibilities:
 * - Verify the editor boot flow renders canvas and panels.
 * - Regression-test persisted image size behavior across reloads.
 */
import { test, expect, type Request } from "@playwright/test"

import { clampPx, pxUToPxNumber, unitToPxUFixed } from "../lib/editor/units"
import { PROJECT_ID, setupMockRoutes } from "./_mocks"

// Canvas-first model: the top-centre stepper (EditorSectionStepper) switches
// sections via a dropdown; each active section exposes a floating top-right bar
// with that section's actions. Section labels come from SECTION_ITEMS — the four
// sections are Image / Filter / Trace / Color. The Image section bar opens the
// merged Image + Artboard dialog (image size/position plus artboard size,
// padding and page background — the former standalone Artboard/Grid sheets were
// folded in / removed). (No image → the Image section bar's "Add image" opens
// the OS file picker, not a dialog — see the upload test, which drives the
// hidden input.)

// Switch section via the stepper dropdown: open it through the middle trigger,
// then click the target section's menuitem. The active section is shown in the
// trigger (aria-label "Section: <name>") and is absent from the dropdown, so
// no-op when the target is already active.
async function gotoSection(page: import("@playwright/test").Page, name: string) {
  const trigger = page.getByTestId("section-stepper-trigger")
  if ((await trigger.getAttribute("aria-label")) === `Section: ${name}`) return
  await trigger.click()
  await page.getByRole("menuitem", { name, exact: true }).click()
}

// The merged Image + Artboard dialog (ImageSheet — the former standalone
// Artboard/Grid sheets were folded in). Requires a master image: go to the Image
// section, then open its top-right bar's "Edit image" pencil (the sole opener).
// Idempotent — a no-op if the dialog is already open, since image and artboard
// controls now live in this one sheet (callers may "re-open" between edits).
async function openImageEditor(page: import("@playwright/test").Page) {
  const dialog = page.locator('section[aria-label="Image"]')
  if (await dialog.isVisible().catch(() => false)) return
  await gotoSection(page, "Image")
  await page.getByRole("button", { name: "Edit image", exact: true }).click()
  await expect(dialog).toBeVisible()
}

// Back-compat aliases: image size/position and the artboard/page settings now
// share the single merged dialog above.
const openImageDialog = openImageEditor
const openArtboardDialog = openImageEditor

// Switch to the Filter section (reveals the top-right EditorFilterBar with its
// "Add filter" / "Edit filter" action).
async function gotoFilterSection(page: import("@playwright/test").Page) {
  await gotoSection(page, "Filter")
}

// Open the filter picker (FilterSelectionController). Requires an active image
// source — without one the "Add filter" action is disabled and this cannot
// proceed (see the disabled-gate regression test).
async function openFilterMenu(page: import("@playwright/test").Page) {
  await gotoFilterSection(page)
  await page.getByLabel("Add filter").click()
}

async function gotoProject(page: import("@playwright/test").Page) {
  const res = await page.goto(`/projects/${PROJECT_ID}`)
  if (!res?.ok()) {
    throw new Error(
      `[ENV_SERVER] Project page request failed: status=${res?.status() ?? "unknown"} url=${res?.url() ?? "unknown"}`
    )
  }
}

async function assertEditorSurfaceVisible(page: import("@playwright/test").Page) {
  const crashed = page.getByText("Editor crashed")
  const canvasRoot = page.getByTestId("editor-canvas-root")

  // Wait for either the happy path (canvas) or the error boundary.
  try {
    await expect(crashed.or(canvasRoot)).toBeVisible()
  } catch (error) {
    const url = page.url()
    const title = await page.title().catch(() => "unknown")
    throw new Error(
      `[APP_RUNTIME_OR_ENV_SERVER] Editor surface did not appear (url=${url}, title=${title}). ` +
        `Classify as ENV_SERVER or APP_RUNTIME before locator changes. ` +
        `Original: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  if (await crashed.isVisible()) {
    const details = await page.locator("pre").first().textContent().catch(() => null)
    throw new Error(`Editor crashed in E2E.\n\n${details ?? "(no stack available)"}`)
  }

  // Canvas-first model: no always-mounted property panel. The editor
  // chrome is the floating bottom navigation (Home + section nav) —
  // assert it mounted alongside the canvas.
  await expect(page.getByRole("link", { name: "Home" }).first()).toBeVisible()
}

test("smoke: /projects/:id loads editor with artboard + canvas", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1", "x-e2e-user": "1" })
  await setupMockRoutes(page, { withImage: true })

  await gotoProject(page)
  await assertEditorSurfaceVisible(page)
  await expect(page.locator("canvas").first()).toBeVisible()
})

test("smoke: upload/crop/filter/remove/restore flow keeps deterministic image source", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1", "x-e2e-user": "1" })
  await setupMockRoutes(page, { withImage: false })

  await gotoProject(page)
  await assertEditorSurfaceVisible(page)

  const apiFlow = await page.evaluate(async (projectId: string) => {
    const out: Record<string, unknown> = {}
    const post = async (path: string, body?: Record<string, unknown>) => {
      const r = await fetch(path, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      return { status: r.status, json: await r.json() }
    }
    const del = async (path: string) => {
      const r = await fetch(path, { method: "DELETE" })
      return { status: r.status, json: await r.json() }
    }
    const get = async (path: string) => {
      const r = await fetch(path)
      return { status: r.status, json: await r.json() }
    }

    // Upload is now direct-to-Storage + a JSON finalize; at the API level the
    // mock's finalize branch flips hasImage and returns { ok: true }.
    const imageId = crypto.randomUUID()
    const uploadRes = await fetch(`/api/projects/${projectId}/images/master/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageId, fileName: "test.svg", format: "svg" }),
    })
    out.upload = { status: uploadRes.status, json: await uploadRes.json() }

    const master = await get(`/api/projects/${projectId}/images/master`)
    out.master = master
    const sourceImageId = String((master.json as { id?: string }).id ?? "")

    out.crop = await post(`/api/projects/${projectId}/images/crop`, {
      source_image_id: sourceImageId,
      x: 0,
      y: 0,
      w: 10,
      h: 10,
    })

    out.filter = await post(`/api/projects/${projectId}/images/filters`, {
      filter_type: "bw_hard",
      filter_params: { superpixel_width: 4 },
    })

    const filterId = String(((out.filter as { json?: { item?: { id?: string } } }).json?.item?.id ?? ""))
    out.remove = await del(`/api/projects/${projectId}/images/filters/${filterId}`)
    out.restore = await post(`/api/projects/${projectId}/images/master/restore`)
    out.working = await post(`/api/projects/${projectId}/images/filter-working-copy`)

    return out
  }, PROJECT_ID)

  expect(apiFlow.upload).toMatchObject({ status: 200 })
  expect(apiFlow.master).toMatchObject({ status: 200 })
  expect(apiFlow.crop).toMatchObject({ status: 200 })
  expect(apiFlow.filter).toMatchObject({ status: 200 })
  expect(apiFlow.remove).toMatchObject({ status: 200 })
  expect(apiFlow.restore).toMatchObject({ status: 200 })
  expect(apiFlow.working).toMatchObject({ status: 200 })

  const workingJson = (apiFlow.working as { json?: { exists?: boolean; stack?: unknown[] } }).json
  expect(workingJson?.exists).toBe(true)
  expect(Array.isArray(workingJson?.stack)).toBe(true)
  expect((workingJson?.stack ?? []).length).toBe(0)
})

test("regression: adding a filter is disabled without an active image source", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1", "x-e2e-user": "1" })
  await setupMockRoutes(page, { withImage: false })

  await gotoProject(page)
  await assertEditorSurfaceVisible(page)
  await gotoFilterSection(page)

  // No source image → a filter has nothing to run on, so "Add filter" is
  // disabled (the picker cannot be opened).
  await expect(page.getByLabel("Add filter")).toBeDisabled()
})

test("regression: adding a filter is enabled with an active image source", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1", "x-e2e-user": "1" })
  await setupMockRoutes(page, { withImage: true })

  await gotoProject(page)
  await assertEditorSurfaceVisible(page)
  await gotoFilterSection(page)

  // With a source image "Add filter" is enabled (opens the picker).
  await expect(page.getByLabel("Add filter")).toBeEnabled()
})

test("regression: upload makes image usable without page reload", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1", "x-e2e-user": "1" })
  await setupMockRoutes(page, { withImage: false })

  await gotoProject(page)
  await assertEditorSurfaceVisible(page)
  await gotoFilterSection(page)
  await expect(page.getByLabel("Add filter")).toBeDisabled()
  // No image → "Add image" opens the OS file picker directly (no sheet). The
  // hidden master-image input is always mounted at the shell, so drive it.
  const uploadInput = page.getByTestId("master-image-file-input")
  await expect(uploadInput).toBeAttached()
  const waitUploadResponse = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      res.url().includes(`/api/projects/${PROJECT_ID}/images/master/finalize`) &&
      res.status() === 200
  )
  const waitWorkingCopyResponse = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      res.url().includes(`/api/projects/${PROJECT_ID}/images/filter-working-copy`) &&
      res.status() === 200
  )
  await uploadInput.setInputFiles("e2e/fixtures/upload-test.svg")
  await waitUploadResponse
  const workingCopyRes = await waitWorkingCopyResponse
  const workingCopyJson = (await workingCopyRes.json()) as { exists?: boolean }
  expect(workingCopyJson.exists).toBe(true)

  // After upload the source image exists → "Add filter" becomes enabled.
  await gotoFilterSection(page)
  await expect(page.getByLabel("Add filter")).toBeEnabled()
})

test("regression: filter error does not leak into restore dialog", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1", "x-e2e-user": "1" })
  await setupMockRoutes(page, { withImage: true })
  await page.route(`**/api/projects/${PROJECT_ID}/images/filters`, async (route) => {
    if (route.request().method() !== "POST") return route.fallback()
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "forced filter failure" }),
    })
  })

  await gotoProject(page)
  await assertEditorSurfaceVisible(page)
  await openFilterMenu(page)

  // Pick a kind + Apply (the picker is select-then-Apply, not instant); the
  // mocked 500 surfaces as a toast, not in any dialog.
  await page.getByLabel("B&W Hard").click()
  await page.getByRole("button", { name: "Apply" }).click()
  await expect(page.getByText("forced filter failure")).toBeVisible()

  await openImageDialog(page)
  await page.getByLabel("Restore image").click()
  await expect(page.getByRole("heading", { name: "Restore image?" })).toBeVisible()
  await expect(page.getByText("forced filter failure")).toHaveCount(0)
})

test.skip("storage: upload → master returns signed URL → editor renders image", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1", "x-e2e-user": "1" })
  await setupMockRoutes(page, { withImage: false })

  const res = await page.goto(`/projects/${PROJECT_ID}`)
  expect(res?.ok()).toBe(true)
  await assertEditorSurfaceVisible(page)

  const upload = await page.evaluate(async (projectId: string) => {
    const imageId = crypto.randomUUID()
    const res = await fetch(`/api/projects/${projectId}/images/master/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageId, fileName: "test.svg", format: "svg" }),
    })
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

test.skip("image size: setting 100mm survives reload (no drift)", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1", "x-e2e-user": "1" })
  let imageStatePosts = 0
  await setupMockRoutes(page, {
    withImage: true,
    workspace: {
      unit: "mm",
      width_value: 200,
      height_value: 200,
      width_px_u: unitToPxUFixed("200", "mm").toString(),
      height_px_u: unitToPxUFixed("200", "mm").toString(),
      width_px: clampPx(pxUToPxNumber(unitToPxUFixed("200", "mm"))),
      height_px: clampPx(pxUToPxNumber(unitToPxUFixed("200", "mm"))),
    },
  })

  await page.goto(`/projects/${PROJECT_ID}`)
  await openImageDialog(page)

  const w = page.getByLabel("Image width (mm)")
  const h = page.getByLabel("Image height (mm)")

  const expectedPxU = unitToPxUFixed("100", "mm").toString()

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

  await openImageDialog(page)
  await expect(page.getByLabel("Image width (mm)")).toHaveValue("100")
  await expect(page.getByLabel("Image height (mm)")).toHaveValue("100")

  // Unit toggle should not trigger image-state save.
  await openArtboardDialog(page)
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

  // DPI-only workspace change must not trigger image-state writes.
  await openArtboardDialog(page)
  await page.getByLabel("Raster effects resolution").click()
  await page.getByRole("option", { name: "High (300 ppi)" }).click()

  // After DPI change, changing unit in the image panel still must not persist image geometry.
  await openArtboardDialog(page)
  await page.getByLabel("Artboard unit").click()
  await page.getByRole("option", { name: "px" }).click()
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

test.skip("image transform chain: resize + rotate + drag persists", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1", "x-e2e-user": "1" })
  await setupMockRoutes(page, {
    withImage: true,
    workspace: {
      unit: "mm",
      width_value: 200,
      height_value: 200,
      width_px_u: unitToPxUFixed("200", "mm").toString(),
      height_px_u: unitToPxUFixed("200", "mm").toString(),
      width_px: clampPx(pxUToPxNumber(unitToPxUFixed("200", "mm"))),
      height_px: clampPx(pxUToPxNumber(unitToPxUFixed("200", "mm"))),
    },
  })

  await page.goto(`/projects/${PROJECT_ID}`)
  await openImageDialog(page)

  const w = page.getByLabel("Image width (mm)")
  const h = page.getByLabel("Image height (mm)")

  await expect(w).toBeEnabled()
  await expect(h).toBeEnabled()

  const expectedPxU = unitToPxUFixed("120", "mm").toString()
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
  const waitDragSave = page.waitForRequest((req) => isSaveWith(req, { rotation: 90, requirePosition: true }))
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30)
  await page.mouse.up()

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

  await openImageDialog(page)
  await expect(page.getByLabel("Image width (mm)")).toHaveValue("120")
  await expect(page.getByLabel("Image height (mm)")).toHaveValue("120")
})

test.skip("page background: toggling persists via workspace upsert", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1", "x-e2e-user": "1" })
  let workspaceUpserts = 0

  await setupMockRoutes(page, {
    withImage: true,
    workspace: {
      unit: "mm",
      width_value: 200,
      height_value: 200,
      width_px: 2362.2047,
      height_px: 2362.2047,
      page_bg_enabled: true,
      page_bg_color: "#ffffff",
      page_bg_opacity: 50,
    },
  })

  page.on("request", (req) => {
    if (req.url().includes("/rest/v1/project_workspace") && (req.method() === "POST" || req.method() === "PATCH")) {
      workspaceUpserts += 1
    }
  })

  await page.goto(`/projects/${PROJECT_ID}`)
  await openArtboardDialog(page)

  const toggle = page.getByLabel("Hide page background")
  await expect(toggle).toBeEnabled()
  await toggle.click()

  // Debounced save.
  await expect.poll(() => workspaceUpserts, { timeout: 1_000 }).toBeGreaterThanOrEqual(1)
  expect(workspaceUpserts).toBeGreaterThanOrEqual(1)
})

test("auth redirects: protected pages require auth (E2E simulated)", async ({ page }) => {
  // Assert proxy redirects without following to server-rendered pages.
  const unauthRes = await page.request.get("/dashboard", { maxRedirects: 0 })
  expect(unauthRes.status()).toBeGreaterThanOrEqual(300)
  expect(unauthRes.status()).toBeLessThan(400)
  expect(unauthRes.headers()["location"]).toContain("/login")

  const authedRes = await page.request.get("/login", {
    headers: { "x-e2e-user": "1" },
    maxRedirects: 0,
  })
  expect(authedRes.status()).toBeGreaterThanOrEqual(300)
  expect(authedRes.status()).toBeLessThan(400)
  expect(authedRes.headers()["location"]).toContain("/dashboard")
})
