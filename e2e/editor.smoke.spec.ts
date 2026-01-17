import { test, expect } from "@playwright/test"

const PROJECT_ID = "00000000-0000-0000-0000-000000000001"

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

  // A tiny 1x1 png data URL (known-good; works reliably with window.Image).
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

  let persisted: any = null
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

    // Internal API: image-state
    if (url.endsWith(`/api/projects/${PROJECT_ID}/image-state`)) {
      if (req.method() === "GET") {
        getCount++
        if (!opts.persistImageState || !persisted) {
          return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ exists: false }) })
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            exists: true,
            state: {
              x: persisted.x,
              y: persisted.y,
              scale_x: persisted.scale_x,
              scale_y: persisted.scale_y,
              width_px: persisted.width_px ?? null,
              height_px: persisted.height_px ?? null,
              rotation_deg: persisted.rotation_deg ?? 0,
            },
          }),
        })
      }

      if (req.method() === "POST") {
        postCount++
        persisted = await req.postDataJSON()
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
  await page.waitForFunction(() => Boolean((globalThis as any).__gruf_editor?.image))

  const before = await page.evaluate(() => {
    const g: any = (globalThis as any).__gruf_editor
    return { x: g.image.x(), y: g.image.y() }
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
    const g: any = (globalThis as any).__gruf_editor
    return { x: g.image.x(), y: g.image.y() }
  })

  expect(after.x).not.toBeCloseTo(before.x)
  expect(after.y).not.toBeCloseTo(before.y)

  await page.reload()
  await expect(page.getByText("Artboard")).toBeVisible()
  await page.getByRole("button", { name: "Select (Move Image)" }).click()
  await page.waitForFunction(() => Boolean((globalThis as any).__gruf_editor?.image))

  await expect.poll(() => mock.getCounts().getCount, { timeout: 5000 }).toBeGreaterThan(0)

  const afterReload = await page.evaluate(() => {
    const g: any = (globalThis as any).__gruf_editor
    return { x: g.image.x(), y: g.image.y() }
  })

  expect(afterReload.x).toBeCloseTo(after.x, 0)
  expect(afterReload.y).toBeCloseTo(after.y, 0)
})

test("wheel pans and ctrl/cmd+wheel zooms", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1" })
  setupMockRoutes(page, { withImage: true })

  await page.goto(`/projects/${PROJECT_ID}`)
  await expect(page.getByText("Artboard")).toBeVisible()

  await page.waitForFunction(() => Boolean((globalThis as any).__gruf_editor?.stage))

  const before = await page.evaluate(() => {
    const g: any = (globalThis as any).__gruf_editor
    return { x: g.stage.x(), y: g.stage.y(), s: g.stage.scaleX() }
  })

  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, 160)

  await expect
    .poll(async () => await page.evaluate(() => ({ x: (globalThis as any).__gruf_editor.stage.x(), y: (globalThis as any).__gruf_editor.stage.y() })), {
      timeout: 5000,
    })
    .not.toEqual({ x: before.x, y: before.y })

  const afterPanScale = await page.evaluate(() => (globalThis as any).__gruf_editor.stage.scaleX())

  await page.keyboard.down("Control")
  await page.mouse.wheel(0, -160)
  await page.keyboard.up("Control")

  await expect.poll(async () => await page.evaluate(() => (globalThis as any).__gruf_editor.stage.scaleX()), { timeout: 5000 }).not.toBeCloseTo(
    afterPanScale
  )
})

test("restore resets image transform (with confirmation)", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1" })
  const mock = setupMockRoutes(page, { withImage: true, persistImageState: true })

  await page.goto(`/projects/${PROJECT_ID}`)
  await expect(page.getByText("Artboard")).toBeVisible()

  await page.getByRole("button", { name: "Select (Move Image)" }).click()
  await page.waitForFunction(() => Boolean((globalThis as any).__gruf_editor?.image))

  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")

  // Move away from center
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 60)
  await page.mouse.up()

  await expect.poll(() => mock.getCounts().postCount, { timeout: 5000 }).toBeGreaterThan(0)

  // Restore via confirmation dialog.
  await page.getByRole("button", { name: "Restore image" }).click()
  await expect(page.getByText("Restore image?")).toBeVisible()
  await page.getByRole("button", { name: "Restore" }).click()

  await expect.poll(() => mock.getCounts().postCount, { timeout: 5000 }).toBeGreaterThanOrEqual(2)

  const expectedCenter = { x: mock.workspaceRow.width_px / 2, y: mock.workspaceRow.height_px / 2 }

  await expect
    .poll(async () => await page.evaluate(() => ({ x: (globalThis as any).__gruf_editor.image.x(), y: (globalThis as any).__gruf_editor.image.y() })), {
      timeout: 5000,
    })
    .toEqual({ x: expectedCenter.x, y: expectedCenter.y })

  // Reload should keep restored placement.
  await page.reload()
  await expect(page.getByText("Artboard")).toBeVisible()
  await page.getByRole("button", { name: "Select (Move Image)" }).click()
  await page.waitForFunction(() => Boolean((globalThis as any).__gruf_editor?.image))

  await expect.poll(() => mock.getCounts().getCount, { timeout: 5000 }).toBeGreaterThan(0)

  const afterReload = await page.evaluate(() => {
    const g: any = (globalThis as any).__gruf_editor
    return { x: g.image.x(), y: g.image.y() }
  })

  expect(afterReload.x).toBeCloseTo(expectedCenter.x, 0)
  expect(afterReload.y).toBeCloseTo(expectedCenter.y, 0)
})
