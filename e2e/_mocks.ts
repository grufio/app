/**
 * Playwright network mocks for E2E.
 *
 * Responsibilities:
 * - Stub Supabase PostgREST + Storage calls for editor flows.
 * - Provide deterministic test fixtures (project/workspace/image/image-state).
 *
 * Mock-mode contract (see lib/e2e.ts):
 *   E2E_TEST=1                 — must be set in the server env (see
 *                                dev:e2e / start:e2e in package.json) for
 *                                the test bypasses to take effect.
 *   x-e2e-test: "1"  header    — opts the request in to the
 *                                PostgREST/Storage stubs installed by
 *                                setupMockRoutes().
 *   x-e2e-user: "1"  header    — request is treated as authenticated
 *                                (proxy redirects /login → /dashboard,
 *                                and protected routes stop bouncing to
 *                                /login).
 *
 * Typical setup in a spec:
 *
 *   import { PROJECT_ID, setupMockRoutes } from "./_mocks"
 *
 *   test.beforeEach(async ({ page }) => {
 *     await page.setExtraHTTPHeaders({ "x-e2e-test": "1", "x-e2e-user": "1" })
 *     await setupMockRoutes(page, { withImage: true })
 *   })
 *
 *   test("…", async ({ page }) => {
 *     await page.goto(`/projects/${PROJECT_ID}`)
 *   })
 *
 * Forgetting either header is the most common failure mode: without
 * `x-e2e-user` the editor route 302s to /login; without `x-e2e-test` +
 * `setupMockRoutes` the page hits real Supabase and fails 401.
 *
 * PROJECT_ID is a deterministic v4 UUID that the route handlers accept
 * (`isUuid()` validates v1–v5). Use it everywhere a real project id
 * would appear in URLs or payloads.
 */
import type { Page } from "@playwright/test"

import { clampPx, pxUToPxNumber, unitToPxUFixed } from "@/lib/editor/units"

// Must match `isUuid()` (UUID v1-5); use a deterministic v4-style UUID for tests.
export const PROJECT_ID = "00000000-0000-4000-8000-000000000001"

export type SetupMockRoutesOpts = {
  withImage: boolean
  /**
   * When true, the list response includes a `display_target` block with
   * `active_image_id` populated (active = filter_working_copy). Used by
   * tests that need the "active image present" shape — the master-delete-
   * cascade refactor moved the actual delete-button gate to
   * `Boolean(masterImage)` upstream, so this flag no longer drives
   * `deletable`/`reason` (those fields are gone from the API contract).
   */
  deletableActive?: boolean
  workspace?: Partial<{
    unit: "mm" | "cm" | "pt" | "px"
    width_value: number
    height_value: number
    width_px_u: string
    height_px_u: string
    width_px: number
    height_px: number
    page_bg_enabled: boolean
    page_bg_color: string
    page_bg_opacity: number
  }>
  imageState?: { exists: false } | { exists: true; state: ImageStateRow }
}

type ImageStateRow = {
  image_id?: string | null
  x_px_u?: string | null
  y_px_u?: string | null
  width_px_u?: string | null
  height_px_u?: string | null
  rotation_deg: number
}

export async function setupMockRoutes(page: Page, opts: SetupMockRoutesOpts) {
  const defaultWorkspaceRow = {
    project_id: PROJECT_ID,
    unit: "cm",
    width_value: 20,
    height_value: 30,
    // canonical µpx (strings)
    width_px_u: unitToPxUFixed("20", "cm").toString(),
    height_px_u: unitToPxUFixed("30", "cm").toString(),
    // cached integer px
    width_px: clampPx(pxUToPxNumber(unitToPxUFixed("20", "cm"))),
    height_px: clampPx(pxUToPxNumber(unitToPxUFixed("30", "cm"))),
    page_bg_enabled: false,
    page_bg_color: "#ffffff",
    page_bg_opacity: 50,
  }
  const workspaceRow = { ...defaultWorkspaceRow, ...(opts.workspace ?? {}) }

  // Visible inline SVG so Konva renders deterministically.
  const dataImage =
    "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2220%22%20height%3D%2210%22%3E%3Crect%20width%3D%2220%22%20height%3D%2210%22%20fill%3D%22%23ff3b30%22/%3E%3C/svg%3E"

  let hasImage = Boolean(opts.withImage)
  const deletableActive = Boolean(opts.deletableActive)
  const activeImageId = "11111111-1111-4111-8111-111111111111"
  // Stable per-project identity = the immutable `kind='master'` row id.
  // The real master GET route (app/api/.../images/master/route.ts) always
  // returns `masterRowId` (PR #267/#268 contract); the client uses it — NOT
  // the active image id (which flips on filter/crop/trace apply) — as the
  // master-transition key for the authoritative display source
  // (`useDisplaySize`). It MUST be distinct from `activeImageId` and stable
  // across the session, otherwise the mock diverges from prod: a
  // missing/changing value silently triggers a re-seed/clear and drops the
  // persisted display transform (the exact regression that the
  // pixelate-aspect e2e gate guards against).
  const masterRowId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  let currentImageId = activeImageId
  let imageCounter = 0
  const imageVersions = new Map<
    string,
    {
      id: string
      signedUrl: string
      width_px: number
      height_px: number
      name: string
      source_image_id: string | null
      isFilterResult: boolean
    }
  >([
    [
      activeImageId,
      {
        id: activeImageId,
        signedUrl: dataImage,
        width_px: 20,
        height_px: 10,
        name: "test.svg",
        source_image_id: null,
        isFilterResult: false,
      },
    ],
  ])
  const filterStack: Array<{
    id: string
    input_image_id: string
    output_image_id: string
    filter_type: "bw_hard" | "bw_soft" | "bw_warm"
    stack_order: number
  }> = []
  const nextImageId = () => {
    imageCounter += 1
    const suffix = String(imageCounter).padStart(12, "0")
    return `22222222-2222-4222-8222-${suffix}`
  }
  const nextFilterId = () => {
    const suffix = String(filterStack.length + 1).padStart(12, "0")
    return `33333333-3333-4333-8333-${suffix}`
  }
  const currentImagePayload = () => {
    const img = imageVersions.get(currentImageId)
    if (!hasImage || !img) return { exists: false as const }
    return {
      exists: true as const,
      id: img.id,
      signedUrl: img.signedUrl,
      width_px: img.width_px,
      height_px: img.height_px,
      name: img.name,
    }
  }
  // Master GET payload mirrors the real route: same fields as the active
  // image PLUS the stable `masterRowId` (and `restore_base`). Keeping these
  // present is what makes the canvas-tx mirror behave like prod across an
  // apply/resize.
  const masterImagePayload = () => {
    const base = currentImagePayload()
    if (!base.exists) return base
    return {
      ...base,
      masterRowId,
      restore_base: {
        id: masterRowId,
        width_px: base.width_px,
        height_px: base.height_px,
        dpi: 300,
      },
    }
  }

  let imageState: ImageStateRow | null = opts.imageState && opts.imageState.exists ? opts.imageState.state : null

  page.route("**/*", async (route) => {
    const url = route.request().url()

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

    // Internal API: list project images (used by tree + lock state).
    if (url.includes(`/api/projects/${PROJECT_ID}/images/master/list`)) {
      const baseBody = {
        items: hasImage
          ? [
              {
                id: activeImageId,
                name: "test.svg",
                format: "svg",
                width_px: 20,
                height_px: 10,
                dpi: 300,
                storage_path: `projects/${PROJECT_ID}/master/mock-upload.svg`,
                storage_bucket: "project-images",
                file_size_bytes: 128,
                is_active: true,
                is_locked: false,
                created_at: "2026-01-01T00:00:00.000Z",
              },
            ]
          : [],
      }
      // Tests that need an "active image present" shape flip
      // `deletableActive`. Post master-delete-cascade refactor the
      // shape no longer carries `deletable`/`reason` — the client
      // gates on `Boolean(masterImage)` directly.
      const body = deletableActive
        ? { ...baseBody, display_target: { active_image_id: activeImageId, kind: "filter_working_copy" }, fallback_target: null }
        : baseBody
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
    }

    // Internal API: master image exists + signed URL
    if (
      url.includes(`/api/projects/${PROJECT_ID}/images/master`) &&
      !url.includes("/exists") &&
      !url.includes("/upload") &&
      !url.includes("/list") &&
      !url.includes("/restore")
    ) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(masterImagePayload()),
      })
    }

    if (url.includes(`/api/projects/${PROJECT_ID}/images/master/exists`)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ exists: hasImage }),
      })
    }

    // Internal API: upload master image (mocked)
    if (url.includes(`/api/projects/${PROJECT_ID}/images/master/upload`)) {
      const req = route.request()
      if (req.method() === "POST") {
        hasImage = true
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, storage_path: `projects/${PROJECT_ID}/master/mock-upload.svg` }),
        })
      }
      return route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ error: "Method not allowed" }) })
    }

    // Internal API: image-state (not needed for MVP smoke)
    if (url.includes(`/api/projects/${PROJECT_ID}/image-state`)) {
      const req = route.request()
      if (req.method() === "POST") {
        try {
          const body = (await req.postDataJSON()) as Partial<ImageStateRow>
          imageState = {
            image_id: hasImage ? currentImageId : null,
            x_px_u: body.x_px_u ?? null,
            y_px_u: body.y_px_u ?? null,
            width_px_u: body.width_px_u ?? null,
            height_px_u: body.height_px_u ?? null,
            rotation_deg: Number(body.rotation_deg ?? 0),
          }
        } catch {
          // ignore bad body
        }
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
      }

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          imageState
            ? {
                exists: true,
                state: {
                  ...imageState,
                  image_id: imageState.image_id ?? (hasImage ? currentImageId : null),
                },
              }
            : { exists: false }
        ),
      })
    }

    if (url.includes(`/api/projects/${PROJECT_ID}/images/filter-working-copy`)) {
      if (!hasImage) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, exists: false }) })
      }
      const img = imageVersions.get(currentImageId)
      if (!img) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, exists: false }) })
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          exists: true,
          id: img.id,
          signed_url: img.signedUrl,
          width_px: img.width_px,
          height_px: img.height_px,
          storage_path: `projects/${PROJECT_ID}/images/${img.id}`,
          source_image_id: img.source_image_id,
          name: img.name,
          is_filter_result: img.isFilterResult,
          stack: filterStack.map((f) => ({
            id: f.id,
            name: f.filter_type,
            filterType: f.filter_type,
            source_image_id: f.input_image_id,
          })),
        }),
      })
    }

    if (url.includes(`/api/projects/${PROJECT_ID}/images/filters`) && route.request().method() === "POST") {
      if (!hasImage) {
        return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "No active image" }) })
      }
      let filterType: "bw_hard" | "bw_soft" | "bw_warm" = "bw_hard"
      try {
        const body = (await route.request().postDataJSON()) as { filter_type?: "bw_hard" | "bw_soft" | "bw_warm" }
        if (body.filter_type === "bw_soft" || body.filter_type === "bw_warm" || body.filter_type === "bw_hard") {
          filterType = body.filter_type
        }
      } catch {
        // Keep default.
      }
      const inputId = currentImageId
      const nextId = nextImageId()
      const parent = imageVersions.get(inputId)
      imageVersions.set(nextId, {
        id: nextId,
        signedUrl: dataImage,
        width_px: parent?.width_px ?? 20,
        height_px: parent?.height_px ?? 10,
        name: `${parent?.name ?? "image"} (${filterType})`,
        source_image_id: inputId,
        isFilterResult: true,
      })
      const item = {
        id: nextFilterId(),
        input_image_id: inputId,
        output_image_id: nextId,
        filter_type: filterType,
        filter_params: {},
        stack_order: filterStack.length + 1,
        created_at: "2026-01-01T00:00:00.000Z",
      }
      filterStack.push({
        id: item.id,
        input_image_id: item.input_image_id,
        output_image_id: item.output_image_id,
        filter_type: item.filter_type,
        stack_order: item.stack_order,
      })
      currentImageId = nextId
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          item,
          image_id: nextId,
          width_px: parent?.width_px ?? 20,
          height_px: parent?.height_px ?? 10,
        }),
      })
    }

    if (url.includes(`/api/projects/${PROJECT_ID}/images/filters/`) && route.request().method() === "DELETE") {
      const filterId = url.split("/").pop() ?? ""
      const idx = filterStack.findIndex((f) => f.id === filterId)
      if (idx < 0) {
        return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Filter not found" }) })
      }
      filterStack.splice(idx)
      currentImageId = idx > 0 ? filterStack[idx - 1].output_image_id : activeImageId
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, active_image_id: currentImageId }),
      })
    }

    if (url.includes(`/api/projects/${PROJECT_ID}/images/crop`) && route.request().method() === "POST") {
      const croppedId = nextImageId()
      imageVersions.set(croppedId, {
        id: croppedId,
        signedUrl: dataImage,
        width_px: 10,
        height_px: 10,
        name: "test.svg (crop)",
        source_image_id: currentImageId,
        isFilterResult: false,
      })
      currentImageId = croppedId
      filterStack.length = 0
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          id: croppedId,
          width_px: 10,
          height_px: 10,
        }),
      })
    }

    if (url.includes(`/api/projects/${PROJECT_ID}/images/master/restore`) && route.request().method() === "POST") {
      currentImageId = activeImageId
      filterStack.length = 0
      hasImage = true
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, image_id: activeImageId }),
      })
    }

    // Trace endpoint: GET returns empty (no trace), POST stores, DELETE clears.
    // Single-row-per-project; the editor uses this to decide whether to
    // render the trace overlay on the Trace tab.
    if (url.includes(`/api/projects/${PROJECT_ID}/trace`)) {
      const method = route.request().method()
      if (method === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(null),
        })
      }
      if (method === "POST" || method === "DELETE") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true }),
        })
      }
    }

    return route.fallback()
  })
}
