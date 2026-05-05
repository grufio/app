/**
 * Visual regression tests for form surfaces.
 *
 * Catches the "Login form too small / Editor panel too big" sawtooth bug
 * class by snapshotting representative surfaces and asserting against a
 * checked-in baseline.
 *
 * Surfaces covered today:
 *   1. Login form (Default Forms — h-9 / text-sm)
 *   2. Editor — right panel with Artboard section (App Forms — h-6 / 12px)
 *   3. Editor — right panel with Image section (App Forms)
 *
 * Add new surfaces here whenever a new form pattern appears (filter dialogs,
 * project create dialog, restore/delete modals, …).
 */
import { expect, test } from "@playwright/test"

import { PROJECT_ID, setupMockRoutes } from "./_mocks"

// Disable animations for stable screenshots.
test.use({
  // Reduces motion globally (Tailwind's `prefers-reduced-motion` paths kick in).
  // Combined with the per-test `page.addStyleTag` below, animations and
  // transitions are effectively neutralized.
  colorScheme: "light",
})

async function freezeAnimations(page: import("@playwright/test").Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
    `,
  })
}

test.describe("forms — visual regressions", () => {
  test("login form (Default Forms)", async ({ page }) => {
    await page.goto("/login")
    await freezeAnimations(page)

    // Login form is the centerpiece of /login; wait for it.
    await expect(page.getByText("Welcome back")).toBeVisible()
    await expect(page.getByPlaceholder("m@example.com")).toBeVisible()

    await expect(page).toHaveScreenshot("login-form.png", {
      fullPage: false,
      maxDiffPixels: 100,
    })
  })

  test("editor — right panel artboard (App Forms)", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-e2e-test": "1", "x-e2e-user": "1" })
    await setupMockRoutes(page, { withImage: true })
    await page.goto(`/projects/${PROJECT_ID}`)
    await freezeAnimations(page)

    // Wait for the artboard panel to render with its size + dpi + unit fields.
    await expect(page.getByTestId("editor-artboard-panel")).toBeVisible()

    // Snapshot just the right panel region — keeps the test independent of
    // canvas rendering noise.
    const sidepanel = page.locator("aside").last()
    await expect(sidepanel).toHaveScreenshot("editor-artboard-panel.png", {
      maxDiffPixels: 200,
    })
  })

  test("editor — right panel image section (App Forms)", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-e2e-test": "1", "x-e2e-user": "1" })
    await setupMockRoutes(page, { withImage: true })
    await page.goto(`/projects/${PROJECT_ID}`)
    await freezeAnimations(page)

    // Switch the layer tree to the Image node so the right panel shows the
    // Image section (with size/position/align/lock fields).
    const layers = page.getByLabel("Layers")
    await expect(layers).toBeVisible()
    const imageBtn = layers.getByRole("button", { name: "Image", exact: true }).first()
    await imageBtn.click()

    // Wait for typical Image-section controls.
    await expect(page.getByLabel(/Image width/i)).toBeVisible()

    const sidepanel = page.locator("aside").last()
    await expect(sidepanel).toHaveScreenshot("editor-image-panel.png", {
      maxDiffPixels: 200,
    })
  })
})
