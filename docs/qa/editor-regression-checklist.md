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

