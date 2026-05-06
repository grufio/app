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

    // With an active image the Image nav item is selected by default; click
    // the Artboard nav item so the right panel renders the Artboard section.
    await page.getByRole("button", { name: "Artboard", exact: true }).first().click()
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

  // S4 follow-up: filter dialogs + create-project + restore/delete modals.
  // Update baselines via `npm run test:e2e:visual:update`.

  // Filter dialogs share a 4-step entry: switch to Filter tab → "Add filter"
  // → click the filter card to select it → click "Select" to confirm.
  async function openFilterDialog(page: import("@playwright/test").Page, name: "Pixelate" | "Line Art" | "Numerate") {
    await page.setExtraHTTPHeaders({ "x-e2e-test": "1", "x-e2e-user": "1" })
    await setupMockRoutes(page, { withImage: true })
    await page.goto(`/projects/${PROJECT_ID}`)
    await freezeAnimations(page)

    // The Layers panel is a tablist (Image / Filter / Colors / Output). The
    // "Add filter" trigger lives inside the Filter tab.
    await page.getByRole("tab", { name: "Filter" }).click()
    await page.getByRole("button", { name: "Add filter" }).click()
    // The picker dialog ("Filter") shows 3 cards — click selects, then the
    // Select footer button opens the actual form dialog.
    await page.getByRole("button", { name, exact: true }).click()
    await page.getByRole("button", { name: "Select", exact: true }).click()
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible()
  }

  test("filter dialog — pixelate", async ({ page }) => {
    await openFilterDialog(page, "Pixelate")
    await expect(page.getByRole("dialog", { name: "Pixelate" })).toHaveScreenshot("filter-pixelate-dialog.png", {
      maxDiffPixels: 200,
    })
  })

  test("filter dialog — lineart", async ({ page }) => {
    await openFilterDialog(page, "Line Art")
    await expect(page.getByRole("dialog", { name: "Line Art" })).toHaveScreenshot("filter-lineart-dialog.png", {
      maxDiffPixels: 200,
    })
  })

  test("filter dialog — numerate", async ({ page }) => {
    await openFilterDialog(page, "Numerate")
    await expect(page.getByRole("dialog", { name: "Numerate" })).toHaveScreenshot("filter-numerate-dialog.png", {
      maxDiffPixels: 200,
    })
  })

  // Skipped: /dashboard is server-rendered. listDashboardProjects() runs on
  // the server and reaches Supabase before any Playwright page.route() can
  // intercept it; without a mocked session the page renders the global
  // error boundary ("Something went wrong"). Wiring a server-side mock for
  // the dashboard listing is out of scope for this PR — needs e2e/_mocks.ts
  // to grow a counterpart, or the dashboard to gain a mock-mode bypass.
  test.skip("dashboard — create project dialog", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-e2e-test": "1", "x-e2e-user": "1" })
    await page.goto("/dashboard")
    await freezeAnimations(page)

    await page.getByRole("button", { name: "New project" }).click()
    await expect(page.getByRole("heading", { name: "Create project" })).toBeVisible()

    await expect(page.getByRole("dialog", { name: "Create project" })).toHaveScreenshot("create-project-dialog.png", {
      maxDiffPixels: 200,
    })
  })

  test("editor — restore confirm modal", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-e2e-test": "1", "x-e2e-user": "1" })
    await setupMockRoutes(page, { withImage: true })
    await page.goto(`/projects/${PROJECT_ID}`)
    await freezeAnimations(page)

    // The Image tab is selected by default in the Layers panel — the Restore
    // image button lives in its right-panel section.
    await page.getByRole("button", { name: "Restore image" }).click()
    await expect(page.getByRole("heading", { name: "Restore image?" })).toBeVisible()

    await expect(page.getByRole("dialog", { name: "Restore image?" })).toHaveScreenshot("restore-confirm-modal.png", {
      maxDiffPixels: 200,
    })
  })

  // Skipped: the "Delete image" button is disabled until there's a
  // deletable variant (working copy or filter result). The current mock
  // (setupMockRoutes withImage:true) only seeds a single master image, so
  // delete remains disabled. Enabling this baseline needs the mock to
  // additionally seed a filter_working_copy row + image — a meaningful
  // mock extension that's out of scope for this PR.
  test.skip("editor — delete confirm modal", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-e2e-test": "1", "x-e2e-user": "1" })
    await setupMockRoutes(page, { withImage: true })
    await page.goto(`/projects/${PROJECT_ID}`)
    await freezeAnimations(page)

    await page.getByRole("button", { name: "Delete image" }).click()
    await expect(page.getByRole("heading", { name: "Delete image?" })).toBeVisible()

    await expect(page.getByRole("dialog", { name: "Delete image?" })).toHaveScreenshot("delete-confirm-modal.png", {
      maxDiffPixels: 200,
    })
  })
})
