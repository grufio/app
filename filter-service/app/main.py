"""
FastAPI service for image processing filters.
"""
import os
import time

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
import cv2
import numpy as np
import io
import base64
from typing import Literal

from app.vectorise import lineart_to_svg, numerate_to_svg


class PhaseTimer:
    """
    Lightweight phase timer used by the filter endpoints to surface a
    per-phase ms breakdown via the `X-Profile-Phases` response header.
    Always-on overhead is one perf_counter() call per phase mark, which
    is sub-microsecond. Profilers (scripts/profile-filters.mjs, F18)
    parse the header; production callers ignore it.
    """

    def __init__(self) -> None:
        self._t0 = time.perf_counter()
        self._last = self._t0
        self._phases: list[tuple[str, float]] = []

    def mark(self, name: str) -> None:
        now = time.perf_counter()
        self._phases.append((name, (now - self._last) * 1000.0))
        self._last = now

    def header(self) -> str:
        total_ms = (time.perf_counter() - self._t0) * 1000.0
        parts = [f"{n}={ms:.1f}" for n, ms in self._phases]
        parts.append(f"total={total_ms:.1f}")
        return ",".join(parts)

app = FastAPI(title="Image Processing Service")

# Bearer-token auth between Next.js and this service. The token is a
# shared secret distributed via the deploy environment (Vercel + Cloud
# Run env vars). When unset, the service runs in "open" mode for local
# development — production deploys MUST set this.
_FILTER_SERVICE_TOKEN = os.environ.get("FILTER_SERVICE_TOKEN", "").strip()


@app.middleware("http")
async def require_bearer_token(request: Request, call_next):
    # /health is intentionally exempt so Cloud Run / load-balancer probes
    # don't need the secret.
    if request.url.path == "/health" or not _FILTER_SERVICE_TOKEN:
        return await call_next(request)
    auth = request.headers.get("authorization", "")
    expected = f"Bearer {_FILTER_SERVICE_TOKEN}"
    if auth != expected:
        return Response(
            status_code=401,
            content='{"detail":"Unauthorized"}',
            media_type="application/json",
        )
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PixelateRequest(BaseModel):
    image_base64: str
    superpixel_width: int
    superpixel_height: int
    color_mode: Literal["rgb", "grayscale"] = "rgb"
    num_colors: int = 16




@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/filters/pixelate")
async def pixelate_filter(request: PixelateRequest):
    if request.superpixel_width < 1 or request.superpixel_height < 1:
        raise HTTPException(status_code=400, detail="Superpixel dimensions must be >= 1")
    if request.num_colors < 2 or request.num_colors > 256:
        raise HTTPException(status_code=400, detail="Number of colors must be between 2 and 256")

    timer = PhaseTimer()
    try:
        img_bytes = base64.b64decode(request.image_base64)
        img = Image.open(io.BytesIO(img_bytes))

        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        timer.mark("decode")

        width, height = img.size
        grid_width = width // request.superpixel_width
        grid_height = height // request.superpixel_height

        if grid_width < 1 or grid_height < 1:
            raise HTTPException(status_code=400, detail=f"Superpixel size too large for image")
        
        # Vectorized superpixel averaging via numpy reshape+mean.
        # Equivalent to the prior nested-loop implementation but ~10-100×
        # faster on large images. Edge handling matches the original:
        # the right-/bottom-most partial superpixels (when the image
        # dimensions aren't an exact multiple of the superpixel size)
        # remain at the result's default value (zero), as before.
        sw = request.superpixel_width
        sh = request.superpixel_height
        h_crop = grid_height * sh
        w_crop = grid_width * sw
        img_array = np.array(img)
        result_array = np.zeros_like(img_array)
        if img.mode == "RGB":
            cropped = img_array[:h_crop, :w_crop]
            # (grid_h, sh, grid_w, sw, 3) → mean over axes 1 and 3.
            # `astype(uint8)` truncates floats, matching the prior `//` behaviour.
            block_means = cropped.reshape(grid_height, sh, grid_width, sw, 3).mean(axis=(1, 3)).astype(np.uint8)
            expanded = block_means.repeat(sh, axis=0).repeat(sw, axis=1)
            result_array[:h_crop, :w_crop] = expanded
        else:
            cropped = img_array[:h_crop, :w_crop]
            block_means = cropped.reshape(grid_height, sh, grid_width, sw).mean(axis=(1, 3)).astype(np.uint8)
            expanded = block_means.repeat(sh, axis=0).repeat(sw, axis=1)
            result_array[:h_crop, :w_crop] = expanded
        result = Image.fromarray(result_array, mode=img.mode)
        timer.mark("mean+expand")

        if request.color_mode == "grayscale":
            result = result.convert("L")

        if request.num_colors < 256:
            result = result.quantize(colors=request.num_colors, method=Image.MEDIANCUT)
            result = result.convert("RGB" if request.color_mode == "rgb" else "L")
        timer.mark("quantize")

        output = io.BytesIO()
        result.save(output, format="PNG", optimize=True)
        output.seek(0)
        timer.mark("encode")

        return Response(
            content=output.getvalue(),
            media_type="image/png",
            headers={"X-Profile-Phases": timer.header()},
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image processing failed: {str(e)}")






class LineArtRequest(BaseModel):
    image_base64: str
    # F22: stroke width is a float (≥0.1) so users can draw very thin
    # outlines. The frontend exposes a 0.1-step decimal input.
    line_thickness: float = 2.0
    blur_amount: int = 3
    smoothness: float = 0.6
    num_colors: int = 8


class NumerateRequest(BaseModel):
    image_base64: str
    superpixel_width: int
    superpixel_height: int
    # F22: stroke width is a float (≥0.1) — see LineArtRequest above.
    stroke_width: float = 2.0
    show_colors: bool = True
    # F20: palette quantisation. vtracer collapses adjacent same-color
    # cells into one polygon — without quantisation, every cell's
    # mean is unique and no merging happens. Default 16 matches
    # pixelate; 256 disables quantisation for parity with the prior
    # behaviour (each cell its own raw mean).
    num_colors: int = 16


@app.post("/filters/numerate")
async def numerate_filter(request: NumerateRequest):
    """
    F20-rewrite: bitmap → quantised palette → superpixel-grid image
    → vtracer (polygon / cutout) → grid-line overlay → SVG.

    The vtracer pass collapses adjacent same-color superpixel cells
    into a single polygon per connected component, preserving the
    paint-by-numbers anchor (one path per region) while killing the
    20K-rect string-assembly cost the legacy implementation paid.
    """
    if request.superpixel_width < 1 or request.superpixel_height < 1:
        raise HTTPException(status_code=400, detail="Superpixel dimensions must be >= 1")
    if request.stroke_width < 0.1 or request.stroke_width > 20:
        raise HTTPException(status_code=400, detail="Stroke width must be between 0.1 and 20")
    if request.num_colors < 2 or request.num_colors > 256:
        raise HTTPException(status_code=400, detail="num_colors must be between 2 and 256")

    timer = PhaseTimer()
    try:
        img_bytes = base64.b64decode(request.image_base64)
        img = Image.open(io.BytesIO(img_bytes))
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        timer.mark("decode")

        width, height = img.size
        grid_width = width // request.superpixel_width
        grid_height = height // request.superpixel_height
        if grid_width < 1 or grid_height < 1:
            raise HTTPException(status_code=400, detail="Superpixel size too large for image")

        svg_content, region_count = numerate_to_svg(
            img,
            superpixel_width=request.superpixel_width,
            superpixel_height=request.superpixel_height,
            stroke_width=request.stroke_width,
            show_colors=request.show_colors,
            num_colors=request.num_colors,
            on_phase=timer.mark,
        )

        return Response(
            content=svg_content,
            media_type="image/svg+xml",
            headers={
                "X-Profile-Phases": timer.header(),
                "X-Region-Count": str(region_count),
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image processing failed: {str(e)}")


@app.post("/filters/lineart")
async def lineart_filter(request: LineArtRequest):
    """
    F20 follow-up rewrite: lineart now goes through the vtracer
    pipeline (palette-quantise → optional Gaussian blur → vtracer
    in spline / cutout mode → black stroke overlay on each region).

    The output is the paint-by-numbers visual most people expect
    from "lineart": organic colored regions with visible black
    outlines, each region addressable for future per-region label
    placement. The pre-rewrite Canny-based outline-only path is
    gone.
    """
    if request.line_thickness < 0.1 or request.line_thickness > 10:
        raise HTTPException(status_code=400, detail="line_thickness must be between 0.1 and 10")
    if request.blur_amount < 0 or request.blur_amount > 20:
        raise HTTPException(status_code=400, detail="blur_amount must be between 0 and 20")
    if request.smoothness < 0 or request.smoothness > 1:
        raise HTTPException(status_code=400, detail="smoothness must be between 0 and 1")
    if request.num_colors < 2 or request.num_colors > 256:
        raise HTTPException(status_code=400, detail="num_colors must be between 2 and 256")

    timer = PhaseTimer()
    try:
        img_bytes = base64.b64decode(request.image_base64)
        img = Image.open(io.BytesIO(img_bytes))
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        timer.mark("decode")

        svg_content, region_count = lineart_to_svg(
            img,
            line_thickness=request.line_thickness,
            blur_amount=request.blur_amount,
            smoothness=request.smoothness,
            num_colors=request.num_colors,
            on_phase=timer.mark,
        )

        return Response(
            content=svg_content,
            media_type="image/svg+xml",
            headers={
                "X-Profile-Phases": timer.header(),
                "X-Region-Count": str(region_count),
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image processing failed: {str(e)}")



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
