/**
 * Editor tab-switching + Trace tab E2E.
 *
 * Wave 3 of `editor-test-coverage.md`. Pins UX flows that aren't
 * covered by the pure-helper tests:
 *
 *   - Image / Filter / Trace tabs are all reachable and switch the
 *     sidebar section accordingly
 *   - The Trace tab's "Add trace" button is gated on an active image
 *     source (same gate as Filter, per `useEditorWorkflowAdapter`)
 *   - Opening the Trace dialog reveals the Pixelate + Line Art options
 *
 * Canvas drag / resize / pan / zoom UX coverage lives in the skipped
 * tests at the bottom of `editor.boot.spec.ts` — those need a working
 * local Supabase to assert persistence and are gated separately.
 */
import { test, expect, type Page } from "@playwright/test"

import { PROJECT_ID, setupMockRoutes } from "./_mocks"

async function selectLeftTab(page: Page, tab: "Image" | "Filter" | "Trace") {
  const id =
    tab === "Trace"
      ? "#editor-left-tabs-trigger-trace"
      : tab === "Filter"
        ? "#editor-left-tabs-trigger-filter"
        : "#editor-left-tabs-trigger-image"
  await page.locator(id).click()
}

async function gotoProject(page: Page) {
  const res = await page.goto(`/projects/${PROJECT_ID}`)
  if (!res?.ok()) {
    throw new Error(
      `[ENV_SERVER] Project page request failed: status=${res?.status() ?? "unknown"} url=${res?.url() ?? "unknown"}`,
    )
  }
  await expect(page.getByTestId("editor-canvas-root")).toBeVisible()
}

test("regression: all three editor tabs are reachable", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1", "x-e2e-user": "1" })
  await setupMockRoutes(page, { withImage: true })

  await gotoProject(page)

  const imageTrigger = page.locator("#editor-left-tabs-trigger-image")
  const filterTrigger = page.locator("#editor-left-tabs-trigger-filter")
  const traceTrigger = page.locator("#editor-left-tabs-trigger-trace")

  await expect(imageTrigger).toBeVisible()
  await expect(filterTrigger).toBeVisible()
  await expect(traceTrigger).toBeVisible()
  await expect(imageTrigger).toBeEnabled()
  await expect(filterTrigger).toBeEnabled()
  await expect(traceTrigger).toBeEnabled()

  // Image is the default tab; aria-selected reflects active state.
  await expect(imageTrigger).toHaveAttribute("data-state", "active")

  await selectLeftTab(page, "Filter")
  await expect(filterTrigger).toHaveAttribute("data-state", "active")

  await selectLeftTab(page, "Trace")
  await expect(traceTrigger).toHaveAttribute("data-state", "active")

  await selectLeftTab(page, "Image")
  await expect(imageTrigger).toHaveAttribute("data-state", "active")
})

test("regression: disabled Colors / Output tab placeholders are gone", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1", "x-e2e-user": "1" })
  await setupMockRoutes(page, { withImage: true })

  await gotoProject(page)

  // PR A3 removed the dead disabled placeholders. Guard against
  // re-introduction.
  await expect(page.locator("#editor-left-tabs-trigger-colors")).toHaveCount(0)
  await expect(page.locator("#editor-left-tabs-trigger-output")).toHaveCount(0)
})

test("regression: Trace add button is disabled without active image", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1", "x-e2e-user": "1" })
  await setupMockRoutes(page, { withImage: false })

  await gotoProject(page)
  await selectLeftTab(page, "Trace")

  await expect(page.getByLabel("Add trace")).toBeDisabled()
})

test("regression: Trace add button is enabled with active image, opens selector", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-e2e-test": "1", "x-e2e-user": "1" })
  await setupMockRoutes(page, { withImage: true })

  await gotoProject(page)
  await selectLeftTab(page, "Trace")

  const addTrace = page.getByLabel("Add trace")
  await expect(addTrace).toBeEnabled()
  await addTrace.click()

  // The trace selection dialog shows the Pixelate + Line Art cards.
  // Card labels come from the trace registry: `lib/editor/trace/pixelate.tsx`
  // (label "Pixelate") and `lib/editor/trace/lineart.ts` (label "Line Art"),
  // rendered as `<button aria-label={label}>` in `filter-type-cards.tsx`.
  await expect(page.getByRole("button", { name: "Pixelate", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Line Art", exact: true })).toBeVisible()
})
