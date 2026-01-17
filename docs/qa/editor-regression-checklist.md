## Editor regression checklist (manual QA)

Goal: catch the common regressions we hit in the Konva-based editor (tools, zoom/pan, persistence, sizing).

### Setup

- Use any existing project (or create a new one).
- Ensure you have a master image uploaded (PNG/JPG).

### 1) Canvas basics

- **Artboard visible**: white background is visible and the border is visible on top of the image.
- **Artboard + image stay on screen**: dragging/releasing never causes the whole canvas to disappear.
- **Canvas resizes**: resizing the browser keeps the stage usable (no stuck black/blank areas).

### 2) Tool behavior (left toolbar)

- **Hand tool**: click+drag pans the workspace (stage moves).
- **Select tool**: click+drag moves the image (image node moves).
- **No cross-talk**: dragging the image must not pan the stage; panning must not move the image.

### 3) Wheel / zoom interactions

- **Wheel pans**: mouse wheel/trackpad scroll pans the workspace.
- **Ctrl/Cmd + wheel zooms**: zoom happens around the cursor and does not trigger browser page zoom.
- **Zoom min/max**: can zoom out below 100% (artboard smaller than the viewport height) and zoom back in.
- **Sidebar zoom buttons**: zoom in/out/fit behave as expected.

### 4) Artboard panel (right sidebar)

- **Width/Height editable**: values can be changed, committed on blur and Tab.
- **Unit + DPI preset**: changes persist after reload.
- **Aspect lock**: when enabled, changing width updates height proportionally (and vice versa).

### 5) Image panel (right sidebar)

- **Width/Height editable**: values can be changed, committed on blur and Tab.
- **No implicit coupling**: width and height do not change each other unless the image lock is enabled.
- **Scaling matches values**: changing width/height scales the image on the canvas (no “read-only” behavior).
- **Alignment buttons**: left/center/right and top/center/bottom align relative to the artboard.

### 6) Restore / delete image

- **Restore**:
  - opens a confirmation dialog
  - after confirming, image resets to default placement (within current artboard)
  - restore is disabled when no image exists or while loading
- **Delete**:
  - opens a confirmation dialog
  - after confirming, image is removed and uploader re-appears
  - delete is disabled when no image exists or while deleting

### 7) Persistence (critical)

- Move/scale/rotate the image.
- Reload the page.
- **Expected**: image position/scale/rotation and image size values persist (no “re-fit to artboard” jump).
- Start dragging the image quickly after load.
- **Expected**: late-loaded persisted state must not override mid-drag.

