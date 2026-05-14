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


class BWRequest(BaseModel):
    """Request body for the no-config black-and-white filters. The
    look is a fixed preset per route — there are no user-tunable
    params, so the only field is the source image."""

    image_base64: str


def _load_image_rgb(image_base64: str) -> np.ndarray:
    """Decode a base64 image to an RGB uint8 array (H, W, 3), 0-255.

    uint8 (not float32): the B&W handlers derive a single float32
    luma plane from this and drop the RGB array immediately, so
    carrying a 4x-larger float copy of the whole image would only
    inflate peak memory for nothing.
    """
    img_bytes = base64.b64decode(image_base64)
    img = Image.open(io.BytesIO(img_bytes))
    if img.mode != "RGB":
        img = img.convert("RGB")
    return np.asarray(img)


def _luma_709(rgb_u8: np.ndarray) -> np.ndarray:
    """Rec.709 luma plane — (H, W) float32, 0-255 — from an
    (H, W, 3) uint8 RGB array. Rec.709 is green-heavy because the eye
    is most sensitive there. Computed channel-wise into a single
    accumulator so no full-res float32 copy of the RGB image is ever
    materialised."""
    luma = rgb_u8[:, :, 0].astype(np.float32)
    luma *= 0.2126
    luma += rgb_u8[:, :, 1] * np.float32(0.7152)
    luma += rgb_u8[:, :, 2] * np.float32(0.0722)
    return luma


def _encode_png(arr: np.ndarray, timer: PhaseTimer) -> Response:
    """Return a uint8 (H, W, 3) RGB array as a PNG Response with the
    profiling header. Marks the `encode` phase. Callers clamp during
    their own in-place math and pass uint8 directly, so no extra
    full-image copy is made here."""
    img = Image.fromarray(arr, mode="RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    timer.mark("encode")
    return Response(
        content=buf.getvalue(),
        media_type="image/png",
        headers={"X-Profile-Phases": timer.header()},
    )


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/filters/bw_hard")
async def bw_hard_filter(request: BWRequest):
    """High-contrast black-and-white (Inkwell-style): deep blacks,
    blown highlights. Rec.709 luma → gamma 0.85 (darkens midtones) →
    steep linear contrast (×1.5 around 128)."""
    timer = PhaseTimer()
    try:
        rgb_u8 = _load_image_rgb(request.image_base64)
        timer.mark("decode")
        luma = _luma_709(rgb_u8)
        del rgb_u8
        # Tone curve, all in-place on the single luma plane:
        # gamma 0.85, then steep linear contrast (x1.5 around 128).
        luma /= 255.0
        np.power(luma, 0.85, out=luma)
        luma *= 255.0
        luma -= 128.0
        luma *= 1.5
        luma += 128.0
        np.clip(luma, 0, 255, out=luma)
        gray_u8 = luma.astype(np.uint8)
        del luma
        out = np.repeat(gray_u8[:, :, np.newaxis], 3, axis=2)
        timer.mark("luma+curve")
        return _encode_png(out, timer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image processing failed: {str(e)}")


@app.post("/filters/bw_soft")
async def bw_soft_filter(request: BWRequest):
    """Soft black-and-white (Moon-style): gentle, retains shadow and
    highlight detail. Rec.709 luma → gamma 1.1 (lifts midtones), no
    extra contrast."""
    timer = PhaseTimer()
    try:
        rgb_u8 = _load_image_rgb(request.image_base64)
        timer.mark("decode")
        luma = _luma_709(rgb_u8)
        del rgb_u8
        # Tone curve, all in-place on the single luma plane:
        # gamma 1.1 (lifts midtones), no extra contrast.
        luma /= 255.0
        np.power(luma, 1.1, out=luma)
        luma *= 255.0
        np.clip(luma, 0, 255, out=luma)
        gray_u8 = luma.astype(np.uint8)
        del luma
        out = np.repeat(gray_u8[:, :, np.newaxis], 3, axis=2)
        timer.mark("luma+curve")
        return _encode_png(out, timer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image processing failed: {str(e)}")


@app.post("/filters/bw_warm")
async def bw_warm_filter(request: BWRequest):
    """Warm-toned black-and-white (Willow-style): fully desaturated,
    then re-tinted warm — red channel lifted, blue pulled down. The
    output is true RGB, not greyscale."""
    timer = PhaseTimer()
    try:
        rgb_u8 = _load_image_rgb(request.image_base64)
        timer.mark("decode")
        luma = _luma_709(rgb_u8)
        del rgb_u8
        # Warm tint: lift red, hold green, pull blue down. Build the
        # uint8 RGB output directly, reusing one float32 scratch plane
        # for all three channels instead of stacking three fresh clips.
        h, w = luma.shape
        out = np.empty((h, w, 3), dtype=np.uint8)
        scratch = luma * 1.05
        np.clip(scratch, 0, 255, out=scratch)
        out[:, :, 0] = scratch
        np.clip(luma, 0, 255, out=scratch)
        out[:, :, 1] = scratch
        np.multiply(luma, 0.92, out=scratch)
        np.clip(scratch, 0, 255, out=scratch)
        out[:, :, 2] = scratch
        del luma, scratch
        timer.mark("luma+tint")
        return _encode_png(out, timer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image processing failed: {str(e)}")






class LineArtRequest(BaseModel):
    image_base64: str
    # F22: stroke width is a float (≥0.1) so users can draw very thin
    # outlines. The frontend exposes a 0.1-step decimal input.
    line_thickness: float = 1.0
    blur_amount: int = 3
    smoothness: float = 0.6
    num_colors: int = 8


class NumerateRequest(BaseModel):
    image_base64: str
    # Resolved grid from the server's `resolveNumerateGrid` — the
    # single source of truth. `cells_x/_y` is the cell count (1 cell =
    # 1 px in the downsampled grid); `crop_*` is the source-image
    # region (px) the grid covers. Whatever lies outside the crop is
    # the centred border. The service just downsamples along this.
    cells_x: int
    cells_y: int
    crop_x: float
    crop_y: float
    crop_w: float
    crop_h: float
    # F22: stroke width is a float (≥0.1) — see LineArtRequest above.
    stroke_width: float = 1.0
    show_colors: bool = True
    # F20: palette quantisation. vtracer collapses adjacent same-color
    # cells into one polygon — without quantisation, every cell's mean
    # is unique and no merging happens.
    num_colors: int = 16


@app.post("/filters/numerate")
async def numerate_filter(request: NumerateRequest):
    """
    Numerate: crop the source to the resolved grid region, downsample
    straight to a `cells_x × cells_y` image (1 cell = 1 px), quantise,
    vtracer → region paths, overlay grid lines. The whole pipeline
    runs on the tiny cell grid, never the full-res image.
    """
    if request.cells_x < 1 or request.cells_y < 1:
        raise HTTPException(status_code=400, detail="cells_x and cells_y must be >= 1")
    if request.crop_w <= 0 or request.crop_h <= 0:
        raise HTTPException(status_code=400, detail="crop_w and crop_h must be > 0")
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

        svg_content, region_count = numerate_to_svg(
            img,
            cells_x=request.cells_x,
            cells_y=request.cells_y,
            crop_x=request.crop_x,
            crop_y=request.crop_y,
            crop_w=request.crop_w,
            crop_h=request.crop_h,
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
