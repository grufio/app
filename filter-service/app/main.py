"""
FastAPI service for image processing filters.
"""
import os
import time

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
import cv2
import numpy as np
import io
import base64

from app.circulate import circulate_cells_to_svg
from app.lineart import lineart_to_svg
from app.pixelate import pixelate_cells_to_svg


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
    # Optional palette pair (lab_munsell for "color" mode, lab_grays
    # for "bw"). When both are provided, every vtracer fill is
    # snapped to the nearest chip — same single-step contract as
    # pixelate / circulate. When omitted, fills stay at the
    # median-cut quantised RGB (legacy back-compat).
    palette_oklab: list | None = None
    palette_rgb: list | None = None


class PixelateRequest(BaseModel):
    # The Vercel server has already cropped + area-averaged the source to a
    # `cells_y × cells_x × 3` uint8 grid. We get the raw bytes as base64
    # (~700× smaller than shipping the source image), plus the cropped pixel
    # dimensions for the SVG viewBox.
    cells_b64: str
    cropped_w_px: int
    cropped_h_px: int
    cells_x: int
    cells_y: int
    # Drives the post-snap top-N reduction (see `pixelate_cells_to_svg`).
    num_colors: int = 16
    # Pre-snap OKLCh chroma multiplier (see
    # `lib/editor/trace/chroma-scale-schema.ts`). Default `1.0` keeps
    # behaviour byte-identical to the pre-feature pipeline; the Vercel
    # default is `1.2` (gemerged with this feature) so callers explicitly
    # opt out by sending `1.0`. Older Vercel revisions that omit the field
    # silently fall back to no-op via Pydantic default.
    pre_snap_chroma_scale: float = 1.0
    # Active palette (Munsell colour `lab_munsell` or b/w `lab_grays`),
    # passed by the Node server from the DB. `palette_oklab[i]` = [L, a, b]
    # (the DB oklab columns), `palette_rgb[i]` = [r, g, b] (0..255), same
    # order. When both are present each cell is snapped to its nearest chip;
    # when omitted, raw area-average means are emitted.
    palette_oklab: list[list[float]] | None = None
    palette_rgb: list[list[int]] | None = None
    # Blue-noise neighbour-invasion texture — sporadic cluster replacements in
    # deep-interior cells (see `app/cell_texture.py`). `texture_enabled = false`
    # (default) or `texture_strength <= 0` makes the step a no-op, byte-
    # identical to the pre-feature pipeline. Independent deploys: when this
    # service is older than the Vercel-side caller, Pydantic's default-extra-
    # ignore drops the fields and we silently render without texture.
    texture_enabled: bool = False
    texture_strength: float = 0.0
    # Dithering at the snap step (PR-F). Default `"none"` preserves
    # byte-identical pre-feature behaviour; Pydantic's default-extra-
    # ignore drops the fields silently when an older Vercel revision
    # omits them. When set to `"knoll_yliluoma"` / `"floyd_steinberg"`,
    # the texture step (`texture_enabled`) is no-op'd — the dither
    # output already covers spatial quantization. `dither_pattern_size`
    # only applies to KY (candidate count N); FS ignores it.
    dither_mode: str = "none"
    dither_pattern_size: int = 4


@app.post("/filters/pixelate")
async def pixelate_filter(request: PixelateRequest):
    """
    Pixelate: emit a `<rect>` per cell at its area-averaged colour, with
    grid lines overlaid. `cells_b64` carries the pre-computed
    `cells_y × cells_x × 3` uint8 RGB grid produced by the Vercel server;
    the service decodes, palette-snaps, renders SVG. No image decode,
    no crop, no downsample on this side.
    """
    if request.cells_x < 1 or request.cells_y < 1:
        raise HTTPException(status_code=400, detail="cells_x and cells_y must be >= 1")
    if request.cropped_w_px < 1 or request.cropped_h_px < 1:
        raise HTTPException(status_code=400, detail="cropped_w_px and cropped_h_px must be >= 1")

    timer = PhaseTimer()
    try:
        raw = base64.b64decode(request.cells_b64)
        expected = request.cells_y * request.cells_x * 3
        if len(raw) != expected:
            raise HTTPException(
                status_code=400,
                detail=f"cells_b64 length mismatch: got {len(raw)} bytes, expected {expected} for {request.cells_y}×{request.cells_x}×3",
            )
        cell_means = np.frombuffer(raw, dtype=np.uint8).reshape(
            request.cells_y, request.cells_x, 3
        )
        timer.mark("decode")

        svg_content, region_count, palette_indices_used = pixelate_cells_to_svg(
            cell_means=cell_means,
            cropped_w_px=request.cropped_w_px,
            cropped_h_px=request.cropped_h_px,
            palette_oklab=request.palette_oklab,
            palette_rgb=request.palette_rgb,
            num_colors=request.num_colors,
            pre_snap_chroma_scale=request.pre_snap_chroma_scale,
            texture_enabled=request.texture_enabled,
            texture_strength=request.texture_strength,
            dither_mode=request.dither_mode,
            dither_pattern_size=request.dither_pattern_size,
            on_phase=timer.mark,
        )

        return JSONResponse(
            content={
                "svg": svg_content,
                "region_count": region_count,
                "palette_indices_used": palette_indices_used,
            },
            headers={
                "X-Profile-Phases": timer.header(),
                "X-Region-Count": str(region_count),
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image processing failed: {str(e)}")


class CirculateRequest(BaseModel):
    # The Vercel server has already cropped + area-averaged the source to a
    # `cells_y × cells_x × 3` uint8 grid via `sharp().raw()` +
    # `cellAreaAverages`. The wire shape ships the raw bytes as base64
    # (~22 KB for a 100×75 grid vs ~16 MB for a 12-MP base64 source), plus
    # the cropped pixel dimensions for the SVG viewBox.
    cells_b64: str
    cropped_w_px: int
    cropped_h_px: int
    cells_x: int
    cells_y: int
    # Ellipse axes as a FRACTION of the cell pitch (0..1). The server converts
    # the mm sizes (outer/inner ellipse vs. pitch = spacing + outer + spacing)
    # into fractions so this service stays mm-agnostic, like Pixelate.
    outer_w_frac: float
    outer_h_frac: float
    inner_enabled: bool = False
    inner_w_frac: float = 0.5
    inner_h_frac: float = 0.5
    # Contour stroke width in crop-pixel space (0 = no contour). Drawn uniform
    # because the ellipses live in pixel space (no non-uniform scale group).
    contour_width_px: float = 0.0
    # Inner-ellipse sub colour filter, resolved by the Node server to OKLab
    # deltas (hue rotation °, lightness shift, chroma scale). Applied to the
    # cell colour then snapped back to the palette. Ignored when no inner
    # ellipse; the identity (0, 0, 1) makes the inner colour equal the outer.
    inner_hue_deg: float = 0.0
    inner_lightness_delta: float = 0.0
    inner_chroma_scale: float = 1.0
    # Active palette (Munsell colour `lab_munsell` or b/w `lab_grays`), passed
    # by the Node server from the DB — same contract as PixelateRequest.
    palette_oklab: list[list[float]] | None = None
    palette_rgb: list[list[int]] | None = None
    # Cap on distinct chip count in the rendered output — same contract as
    # PixelateRequest. Drives the post-snap top-N reduction.
    num_colors: int = 16
    # Pre-snap OKLCh chroma multiplier — same contract as PixelateRequest.
    # Default `1.0` keeps behaviour byte-identical to the pre-feature
    # pipeline; the Vercel default is `1.2`.
    pre_snap_chroma_scale: float = 1.0
    # Blue-noise neighbour-invasion texture — same contract as PixelateRequest.
    # Applied to the OUTER ellipses only; the inner ellipse keeps its derived
    # sub-colour. No-op when disabled or strength is zero.
    texture_enabled: bool = False
    texture_strength: float = 0.0
    # Dithering at the snap step — same contract as PixelateRequest (PR-F).
    # Applied to OUTER ellipse colour; inner ellipse colour is derived from
    # the original pre-snap means.
    dither_mode: str = "none"
    dither_pattern_size: int = 4


@app.post("/filters/circulate")
async def circulate_filter(request: CirculateRequest):
    """
    Circulate: emit one ellipse (optionally two) per cell at its cell centre
    with a contour stroke. `cells_b64` carries the pre-computed
    `cells_y × cells_x × 3` uint8 RGB grid from the Vercel server; the
    service decodes, palette-snaps, optionally texturizes, emits SVG.
    """
    if request.cells_x < 1 or request.cells_y < 1:
        raise HTTPException(status_code=400, detail="cells_x and cells_y must be >= 1")
    if not (0 < request.outer_w_frac <= 1) or not (0 < request.outer_h_frac <= 1):
        raise HTTPException(status_code=400, detail="outer ellipse fractions must be in (0, 1]")
    if request.inner_enabled and (
        not (0 < request.inner_w_frac <= 1) or not (0 < request.inner_h_frac <= 1)
    ):
        raise HTTPException(status_code=400, detail="inner ellipse fractions must be in (0, 1]")
    if request.contour_width_px < 0:
        raise HTTPException(status_code=400, detail="contour_width_px must be >= 0")
    if request.cropped_w_px < 1 or request.cropped_h_px < 1:
        raise HTTPException(status_code=400, detail="cropped_w_px and cropped_h_px must be >= 1")

    timer = PhaseTimer()
    try:
        raw = base64.b64decode(request.cells_b64)
        expected = request.cells_y * request.cells_x * 3
        if len(raw) != expected:
            raise HTTPException(
                status_code=400,
                detail=f"cells_b64 length mismatch: got {len(raw)} bytes, expected {expected} for {request.cells_y}×{request.cells_x}×3",
            )
        cell_means = np.frombuffer(raw, dtype=np.uint8).reshape(
            request.cells_y, request.cells_x, 3
        )
        timer.mark("decode")

        svg_content, region_count, palette_indices_used = circulate_cells_to_svg(
            cell_means=cell_means,
            cropped_w_px=request.cropped_w_px,
            cropped_h_px=request.cropped_h_px,
            outer_w_frac=request.outer_w_frac,
            outer_h_frac=request.outer_h_frac,
            inner_enabled=request.inner_enabled,
            inner_w_frac=request.inner_w_frac,
            inner_h_frac=request.inner_h_frac,
            contour_width_px=request.contour_width_px,
            inner_hue_deg=request.inner_hue_deg,
            inner_lightness_delta=request.inner_lightness_delta,
            inner_chroma_scale=request.inner_chroma_scale,
            palette_oklab=request.palette_oklab,
            palette_rgb=request.palette_rgb,
            num_colors=request.num_colors,
            pre_snap_chroma_scale=request.pre_snap_chroma_scale,
            texture_enabled=request.texture_enabled,
            texture_strength=request.texture_strength,
            dither_mode=request.dither_mode,
            dither_pattern_size=request.dither_pattern_size,
            on_phase=timer.mark,
        )

        return JSONResponse(
            content={
                "svg": svg_content,
                "region_count": region_count,
                "palette_indices_used": palette_indices_used,
            },
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

        svg_content, region_count, palette_indices_used = lineart_to_svg(
            img,
            line_thickness=request.line_thickness,
            blur_amount=request.blur_amount,
            smoothness=request.smoothness,
            num_colors=request.num_colors,
            palette_oklab=request.palette_oklab,
            palette_rgb=request.palette_rgb,
            on_phase=timer.mark,
        )

        return JSONResponse(
            content={
                "svg": svg_content,
                "region_count": region_count,
                "palette_indices_used": palette_indices_used,
            },
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
