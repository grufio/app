/**
 * E2E coverage for the auth flow surfaces.
 *
 * Scope today (without a backing Supabase auth server):
 * - Login page renders all sign-in entry points + form fields.
 * - Empty submit is blocked by browser-native required validation.
 * - /auth/callback without `code` falls through to /dashboard (the proxy
 *   then redirects unauthenticated traffic back to /login — covered by the
 *   "auth redirects" test in editor.boot.spec.ts).
 *
 * Out of scope (would need a real or simulated Supabase backend):
 * - Successful credential login → /dashboard.
 * - OAuth callback exchange (`code` → session).
 * - Logout via NavUser.
 * - Session refresh failure / multi-tab race.
 *
 * The signInWithPassword / signOutClient / signInWithGoogleOAuth helpers
 * are covered at the unit level under services/auth/client/*.test.ts.
 */
import { expect, test } from "@playwright/test"

test.describe("auth flow", () => {
  test("smoke: login page renders all sign-in options", async ({ page }) => {
    await page.goto("/login")

    await expect(page.getByText("Welcome back")).toBeVisible()
    await expect(page.getByRole("button", { name: "Login with Google" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Login with Apple" })).toBeVisible()
    await expect(page.locator("#email")).toBeVisible()
    await expect(page.locator("#password")).toBeVisible()
    await expect(page.getByRole("button", { name: "Login", exact: true })).toBeVisible()
  })

  test("smoke: submitting an empty form stays on /login (required validation)", async ({ page }) => {
    await page.goto("/login")
    await page.getByRole("button", { name: "Login", exact: true }).click()
    await expect(page).toHaveURL(/\/login/)
    // Email field is the first invalid one — browser focuses it.
    await expect(page.locator("#email")).toBeFocused()
  })

  test("smoke: /auth/callback without code redirects to /dashboard", async ({ page }) => {
    const res = await page.request.get("/auth/callback", { maxRedirects: 0 })
    expect(res.status()).toBeGreaterThanOrEqual(300)
    expect(res.status()).toBeLessThan(400)
    expect(res.headers()["location"]).toContain("/dashboard")
  })
})
