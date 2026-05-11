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

from app.vectorise import numerate_to_svg


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
    threshold1: int = 50
    threshold2: int = 200
    line_thickness: int = 2
    invert: bool = True
    blur_amount: int = 3
    min_contour_area: int = 500
    smoothness: float = 0.002


class NumerateRequest(BaseModel):
    image_base64: str
    superpixel_width: int
    superpixel_height: int
    stroke_width: int = 2
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
    if request.stroke_width < 1 or request.stroke_width > 20:
        raise HTTPException(status_code=400, detail="Stroke width must be between 1 and 20")
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
    Apply line art filter with closed contours exported as SVG vectors.
    
    Algorithm:
    1. Optional: Gaussian blur (reduces details)
    2. Canny edge detection
    3. Close gaps with morphological operations
    4. Find closed contours
    5. Filter by minimum area (removes noise)
    6. Export contours as SVG paths (vectors)
    """
    if request.threshold1 < 0 or request.threshold2 < 0:
        raise HTTPException(status_code=400, detail="Thresholds must be >= 0")
    if request.threshold1 >= request.threshold2:
        raise HTTPException(status_code=400, detail="threshold1 must be < threshold2")
    if request.line_thickness < 1 or request.line_thickness > 10:
        raise HTTPException(status_code=400, detail="Line thickness must be between 1 and 10")
    if request.blur_amount < 0 or request.blur_amount > 20:
        raise HTTPException(status_code=400, detail="Blur amount must be between 0 and 20")
    if request.min_contour_area < 0:
        raise HTTPException(status_code=400, detail="Min contour area must be >= 0")
    if request.smoothness < 0 or request.smoothness > 0.1:
        raise HTTPException(status_code=400, detail="Smoothness must be between 0 and 0.1")
    
    try:
        # Decode and convert image
        img_bytes = base64.b64decode(request.image_base64)
        img = Image.open(io.BytesIO(img_bytes))
        img_array = np.array(img)
        
        # Convert to grayscale
        if len(img_array.shape) == 3:
            gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
        else:
            gray = img_array
        
        height, width = gray.shape
        
        # Apply Gaussian blur if requested (reduces details)
        if request.blur_amount > 0:
            # Blur kernel must be odd
            kernel_size = request.blur_amount * 2 + 1
            gray = cv2.GaussianBlur(gray, (kernel_size, kernel_size), 0)
        
        # Apply Canny edge detection
        edges = cv2.Canny(gray, request.threshold1, request.threshold2)
        
        # Close gaps with morphological closing
        kernel_size = max(3, request.line_thickness + 2)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
        closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)
        
        # Find contours
        contours, _ = cv2.findContours(closed, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
        
        # Filter contours by minimum area
        filtered_contours = []
        for contour in contours:
            area = cv2.contourArea(contour)
            if area >= request.min_contour_area:
                filtered_contours.append(contour)
        
        # Convert contours to SVG paths
        svg_paths = []
        for contour in filtered_contours:
            if len(contour) < 3:
                continue
            
            # Apply polygon approximation for smoother curves
            epsilon = request.smoothness * cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, epsilon, True)
            
            # Build SVG path data from approximated contour
            path_data = []
            for i, point in enumerate(approx):
                x, y = point[0]
                if i == 0:
                    path_data.append(f"M {x} {y}")
                else:
                    path_data.append(f"L {x} {y}")
            path_data.append("Z")
            
            svg_paths.append(f'<path d="{" ".join(path_data)}" fill="none" stroke="black" stroke-width="{request.line_thickness}" stroke-linecap="round" stroke-linejoin="round"/>')
        
        # Create SVG document
        svg_content = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <rect width="{width}" height="{height}" fill="{"white" if request.invert else "black"}"/>
  <g>
    {chr(10).join(svg_paths)}
  </g>
</svg>'''
        
        return Response(content=svg_content, media_type="image/svg+xml")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image processing failed: {str(e)}")



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
