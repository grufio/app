## Editor regression checklist (manual QA)

Goal (MVP): a **5-minute** sanity check to catch the common editor regressions (load, tools, zoom/pan, persistence).

### Setup

- Use any existing project (or create a new one).
- Ensure you have a master image uploaded (PNG/JPG).

### 1) Boot / render (1 min)

- **Editor loads**: page renders without errors.
- **Artboard visible**: artboard is visible (white) and border stays on top of the image.
- **Canvas visible**: you can see the image on the canvas.

### 2) Tools (1 min)

- **Hand tool**: click+drag pans the workspace (stage moves).
- **Select tool**: click+drag moves the image (image node moves).
- **No cross-talk**: dragging the image must not pan the stage; panning must not move the image.

### 3) Wheel / zoom (1 min)

- **Wheel pans**: mouse wheel/trackpad scroll pans the workspace.
- **Ctrl/Cmd + wheel zooms**: zoom happens around the cursor and does not trigger browser page zoom.
- **Zoom min/max**: can zoom out below 100% (artboard smaller than the viewport height) and zoom back in.
- **Sidebar zoom buttons**: zoom in/out/fit behave as expected.

### 4) Persistence (2 min)

- Move the image (Select tool).
- Reload the page.
- **Expected**: image position persists (no “re-fit to artboard” jump).

### 5) Image workflow contract (2 min)

- **No image source**: `New Filter` text button and add icon are both disabled.
- **Image source present**: `New Filter` opens selection reliably and does not race with stale error state.
- **Filter apply/remove**: after mutation the visible image refreshes from the canonical working-image endpoint.
- **Restore isolation**: restore panel only shows restore-specific errors; filter/crop errors stay in filter error channel.

### 6) Playwright local runbook (two-port mode)

- Keep the normal app server on `http://127.0.0.1:3000` (for normal development).
- Local E2E always uses dedicated `3110` server mode with `E2E_TEST=1`.
- Run local E2E via:
  - `npm run test:e2e:doctor`
  - `npm run test:e2e:local:smoke`
  - `npm run test:e2e:local:workflow`
  - `npm run test:e2e:local:full`
- Build/type failures are classified as `APP_BUILD` and must be fixed before E2E assertions.
- If preflight says port `3110` is occupied, stop the process on that port and retry.
- If preflight says webserver mode needs a free E2E port, do not point local tests to `3000`.
- CI runs isolated via `npm run test:e2e:ci` and is not expected to reuse a local server.

