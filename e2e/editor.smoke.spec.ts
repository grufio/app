import { test, expect } from "@playwright/test"

const PROJECT_ID = "00000000-0000-0000-0000-000000000001"

type PersistedImageStateBody = {
  role: "master"
  x: number
  y: number
  scale_x: number
  scale_y: number
  width_px?: number
  height_px?: number
  rotation_deg: number
}

type PersistedImageStateRow = {
  x: number
  y: number
  scale_x: number
  scale_y: number
  width_px?: number | null
  height_px?: number | null
  rotation_deg: number
}

type GetImageStateResponse = { exists: false } | { exists: true; state: PersistedImageStateRow }

type GrufEditorHook = {
  stage?: { x(): number; y(): number; scaleX(): number }
  image?: { x(): number; y(): number }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object"
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v)
}

function isPersistedImageStateBody(v: unknown): v is PersistedImageStateBody {
  if (!isRecord(v)) return false
  if (v.role !== "master") return false
  if (!isFiniteNumber(v.x) || !isFiniteNumber(v.y)) return false
  if (!isFiniteNumber(v.scale_x) || !isFiniteNumber(v.scale_y)) return false
  if (!isFiniteNumber(v.rotation_deg)) return false
  if (v.width_px != null && !isFiniteNumber(v.width_px)) return false
  if (v.height_px != null && !isFiniteNumber(v.height_px)) return false
  return true
}

function setupMockRoutes(page: import("@playwright/test").Page, opts: { withImage: boolean; persistImageState?: boolean }) {
  const workspaceRow = {
    project_id: PROJECT_ID,
    unit: "cm",
    width_value: 20,
    height_value: 30,
    dpi_x: 300,
    dpi_y: 300,
    width_px: 800,
    height_px: 600,
    raster_effects_preset: "high",
  }

  const dataPng =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6qv0kAAAAASUVORK5CYII="

  const masterImagePayload = opts.withImage
    ? {
        exists: true,
        signedUrl: dataPng,
        width_px: 200,
        height_px: 100,
        name: "test.png",
      }
    : { exists: false }

  let persisted: PersistedImageStateBody | null = null
  let postCount = 0
  let getCount = 0

  page.route("**/*", async (route) => {
    const req = route.request()
    const url = req.url()

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

    // Internal API: master image
    if (url.endsWith(`/api/projects/${PROJECT_ID}/images/master`)) {
      if (req.method() === "DELETE") {
        // simulate delete: future GET/exists return "no image"
        ;(masterImagePayload as unknown as { exists: boolean }).exists = false
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, deleted: true }) })
      }

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
        body: JSON.stringify({ exists: Boolean((masterImagePayload as unknown as { exists?: boolean }).exists) }),
      })
    }

    // Internal API: image-state
    if (url.endsWith(`/api/projects/${PROJECT_ID}/image-state`)) {
      if (req.method() === "GET") {
        getCount++
        const payload: GetImageStateResponse =
          opts.persistImageState && persisted
            ? {
                exists: true,
                state: {
                  x: persisted.x,
                  y: persisted.y,
                  scale_x: persisted.scale_x,
                  scale_y: persisted.scale_y,
                  width_px: persisted.width_px ?? null,
                  height_px: persisted.height_px ?? null,
                  rotation_deg: persisted.rotation_deg,
                },
              }
            : { exists: false }
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) })
      }

      if (req.method() === "POST") {
        postCount++
        const body = (await req.postDataJSON()) as unknown
        if (!isPersistedImageStateBody(body)) {
          return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "Invalid payload" }) })
        }
        persisted = body
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
      }

      return route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ error: "Method not allowed" }) })
    }

    return route.fallback()
  })

  return {
    getCounts: () => ({ postCount, getCount }),
    getPersisted: () => persisted,
    workspaceRow,
  }
}

test("editor loads without an image (uploader shown)", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1" })
  setupMockRoutes(page, { withImage: false })
  await page.goto(`/projects/${PROJECT_ID}`)

  await expect(page.getByText("Artboard")).toBeVisible()
  await expect(page.getByText("Upload master image")).toBeVisible()
})

test("editor loads with an image (konva canvas present)", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1" })
  setupMockRoutes(page, { withImage: true })
  await page.goto(`/projects/${PROJECT_ID}`)

  await expect(page.getByText("Artboard")).toBeVisible()
  await expect(page.locator("canvas").first()).toBeVisible()
})

test("drag image persists across reload", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1" })
  const mock = setupMockRoutes(page, { withImage: true, persistImageState: true })

  await page.goto(`/projects/${PROJECT_ID}`)
  await expect(page.getByText("Artboard")).toBeVisible()

  await page.getByRole("button", { name: "Select (Move Image)" }).click()
  await page.waitForFunction(() => Boolean((globalThis as unknown as { __gruf_editor?: GrufEditorHook }).__gruf_editor?.image))

  const before = await page.evaluate(() => {
    const h = (globalThis as unknown as { __gruf_editor?: GrufEditorHook }).__gruf_editor
    if (!h?.image) throw new Error("Missing image")
    return { x: h.image.x(), y: h.image.y() }
  })

  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40)
  await page.mouse.up()

  await expect.poll(() => mock.getCounts().postCount, { timeout: 5000 }).toBeGreaterThan(0)
  expect(mock.getPersisted()).toBeTruthy()

  const after = await page.evaluate(() => {
    const h = (globalThis as unknown as { __gruf_editor?: GrufEditorHook }).__gruf_editor
    if (!h?.image) throw new Error("Missing image")
    return { x: h.image.x(), y: h.image.y() }
  })

  expect(after.x).not.toBeCloseTo(before.x)
  expect(after.y).not.toBeCloseTo(before.y)

  await page.reload()
  await expect(page.getByText("Artboard")).toBeVisible()
  await page.getByRole("button", { name: "Select (Move Image)" }).click()
  await page.waitForFunction(() => Boolean((globalThis as unknown as { __gruf_editor?: GrufEditorHook }).__gruf_editor?.image))

  await expect.poll(() => mock.getCounts().getCount, { timeout: 5000 }).toBeGreaterThan(0)

  const afterReload = await page.evaluate(() => {
    const h = (globalThis as unknown as { __gruf_editor?: GrufEditorHook }).__gruf_editor
    if (!h?.image) throw new Error("Missing image")
    return { x: h.image.x(), y: h.image.y() }
  })

  expect(afterReload.x).toBeCloseTo(after.x, 0)
  expect(afterReload.y).toBeCloseTo(after.y, 0)
})

test("wheel pans and ctrl/cmd+wheel zooms", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1" })
  setupMockRoutes(page, { withImage: true })

  await page.goto(`/projects/${PROJECT_ID}`)
  await expect(page.getByText("Artboard")).toBeVisible()

  await page.waitForFunction(() => Boolean((globalThis as unknown as { __gruf_editor?: GrufEditorHook }).__gruf_editor?.stage))

  const readStage = async () =>
    await page.evaluate(() => {
      const h = (globalThis as unknown as { __gruf_editor?: GrufEditorHook }).__gruf_editor
      if (!h?.stage) throw new Error("Missing stage")
      return { x: h.stage.x(), y: h.stage.y(), s: h.stage.scaleX() }
    })

  // In next dev + React StrictMode, refs may briefly be nulled during the mount cycle.
  // Retry the initial read so the test doesn't flake on a transient "Missing stage".
  const before = await (async () => {
    let lastErr: unknown = null
    for (let i = 0; i < 40; i++) {
      try {
        return await readStage()
      } catch (err) {
        lastErr = err
        await page.waitForTimeout(50)
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("Failed to read stage")
  })()

  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, 160)

  await expect
    .poll(async () => await page.evaluate(() => {
      const h = (globalThis as unknown as { __gruf_editor?: GrufEditorHook }).__gruf_editor
      if (!h?.stage) throw new Error("Missing stage")
      return { x: h.stage.x(), y: h.stage.y() }
    }), { timeout: 5000 })
    .not.toEqual({ x: before.x, y: before.y })

  const afterPanScale = (await readStage()).s

  await page.keyboard.down("Control")
  await page.mouse.wheel(0, -160)
  await page.keyboard.up("Control")

  await expect
    .poll(async () => await page.evaluate(() => {
      const h = (globalThis as unknown as { __gruf_editor?: GrufEditorHook }).__gruf_editor
      if (!h?.stage) throw new Error("Missing stage")
      return h.stage.scaleX()
    }), { timeout: 5000 })
    .not.toBeCloseTo(afterPanScale)
})

test("restore resets image transform (with confirmation)", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1" })
  const mock = setupMockRoutes(page, { withImage: true, persistImageState: true })

  await page.goto(`/projects/${PROJECT_ID}`)
  await expect(page.getByText("Artboard")).toBeVisible()

  await page.getByRole("button", { name: "Select (Move Image)" }).click()
  await page.waitForFunction(() => Boolean((globalThis as unknown as { __gruf_editor?: GrufEditorHook }).__gruf_editor?.image))

  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 60)
  await page.mouse.up()

  await expect.poll(() => mock.getCounts().postCount, { timeout: 5000 }).toBeGreaterThan(0)

  await page.getByRole("button", { name: "Restore image" }).click()
  await expect(page.getByText("Restore image?")).toBeVisible()
  await page.getByRole("button", { name: "Restore" }).click()

  await expect.poll(() => mock.getCounts().postCount, { timeout: 5000 }).toBeGreaterThanOrEqual(2)

  const expectedCenter = { x: mock.workspaceRow.width_px / 2, y: mock.workspaceRow.height_px / 2 }

  await expect
    .poll(async () => await page.evaluate(() => {
      const h = (globalThis as unknown as { __gruf_editor?: GrufEditorHook }).__gruf_editor
      if (!h?.image) throw new Error("Missing image")
      return { x: h.image.x(), y: h.image.y() }
    }), { timeout: 5000 })
    .toEqual({ x: expectedCenter.x, y: expectedCenter.y })

  await page.reload()
  await expect(page.getByText("Artboard")).toBeVisible()
  await page.getByRole("button", { name: "Select (Move Image)" }).click()
  await page.waitForFunction(() => Boolean((globalThis as unknown as { __gruf_editor?: GrufEditorHook }).__gruf_editor?.image))

  await expect.poll(() => mock.getCounts().getCount, { timeout: 5000 }).toBeGreaterThan(0)

  const afterReload = await page.evaluate(() => {
    const h = (globalThis as unknown as { __gruf_editor?: GrufEditorHook }).__gruf_editor
    if (!h?.image) throw new Error("Missing image")
    return { x: h.image.x(), y: h.image.y() }
  })

  expect(afterReload.x).toBeCloseTo(expectedCenter.x, 0)
  expect(afterReload.y).toBeCloseTo(expectedCenter.y, 0)
})
