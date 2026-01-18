import { test, expect } from "@playwright/test"

import { PROJECT_ID, setupMockRoutes } from "./_mocks"

test("smoke: /projects/:id loads editor with artboard + canvas", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1" })
  await setupMockRoutes(page, { withImage: true })

  await page.goto(`/projects/${PROJECT_ID}`)
  await expect(page.getByText("Artboard")).toBeVisible()
  await expect(page.locator("canvas").first()).toBeVisible()
})
