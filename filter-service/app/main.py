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
import asyncio
import io
import base64
import urllib.error
import urllib.request
from urllib.parse import urlparse

from app.circulate import circulate_cells_to_svg
from app.linerate import linerate_to_svg
from app.pixelate import pixelate_cells_to_svg

# Pin the OpenCV thread pool to the CPU allocation. The container has --cpu 4 but
# os.cpu_count() reports the host's 8, so cv2 defaults to 8 threads on 4 vCPU →
# over-subscription/thrash on the distance-transform / connected-components ops.
# Matches the OMP/OPENBLAS pins in the Dockerfile and the linerate FFT workers.
cv2.setNumThreads(max(1, int(os.environ.get("OMP_NUM_THREADS", "4") or "4")))


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


_MAX_INPUT_IMAGE_BYTES = 64 * 1024 * 1024  # 64 MB — generous cap for a composited PNG


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # The bridge passes a direct signed storage URL. Refuse to follow redirects
        # so a redirect can't turn the download into an SSRF primitive (e.g. to a
        # cloud metadata endpoint or a file:// URL).
        return None


# build_opener also registers file:// / ftp:// / data:// handlers; combined with the
# https-scheme gate below, the no-redirect handler keeps the fetch to plain HTTPS.
_DOWNLOAD_OPENER = urllib.request.build_opener(_NoRedirectHandler)


def _download_image_bytes(url: str) -> bytes:
    """Download the input image from a signed HTTPS URL. Raises HTTPException with a
    sane status so the Node bridge can map it: 400 → bad url, 502/504 → transient
    (retried), 413 → too large. Synchronous — call via asyncio.to_thread."""
    if urlparse(url).scheme != "https":
        raise HTTPException(status_code=400, detail="image_url must be an https URL")
    try:
        with _DOWNLOAD_OPENER.open(urllib.request.Request(url, method="GET"), timeout=60) as resp:
            data = resp.read(_MAX_INPUT_IMAGE_BYTES + 1)
    except urllib.error.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Failed to download input image: HTTP {e.code}")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise HTTPException(status_code=504, detail=f"Failed to download input image: {e}")
    if len(data) > _MAX_INPUT_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Input image exceeds the size limit")
    return data


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
    # Thread config is surfaced to diagnose CPU-bound trace latency on Cloud Run
    # (OpenCV vs BLAS/OMP pinning — see Dockerfile). Cheap, read-only.
    return {
        "status": "ok",
        "cpu_count": os.cpu_count(),
        "cv2_threads": cv2.getNumThreads(),
        "omp": os.environ.get("OMP_NUM_THREADS"),
        "openblas": os.environ.get("OPENBLAS_NUM_THREADS"),
    }


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






class LinerateRequest(BaseModel):
    # Exactly one of image_base64 / image_url must be set. The Node bridge sends
    # image_url (a signed storage URL) so a large input doesn't ride in the request
    # body (Cloud Run's 32 MB limit → 413 at the GFE, before the container); the
    # service downloads it. image_base64 stays as a back-compat fallback.
    image_base64: str | None = None
    image_url: str | None = None
    line_thickness: float = 1.0
    # Flatten ∈ [0, 1] → L0 edge-preserving smoothing strength. Higher = flatter,
    # more painterly (texture/noise removed, strong edges kept crisp).
    flatten: float = 0.25
    # Detail ∈ [0, 1] → Potts region granularity. Higher = more, finer regions;
    # lower = fewer, larger regions.
    detail: float = 0.75
    # Smoothness ∈ [0, 1] → RDP epsilon + Chaikin iterations on the shared
    # boundary arcs (0 = closer to the working pixels, 1 = very smooth).
    smoothness: float = 0.6
    # Radius ∈ [0, 1] → the "Radius" dial: the paintability WIDTH test uses this
    # fraction of the Min-Gap radius, so only clearly sub-Min-Gap slivers merge while
    # thin-but-paintable strokes survive. Default kept in sync with linerateSchema
    # (python-parity.test.ts); runtime always gets an explicit value from the bridge.
    radius: float = 0.333
    # Max distinct REAL paints to select from the fixed palette.
    # Kept in sync with linerateSchema's default (lib/editor/trace/linerate.ts);
    # python-parity.test.ts enforces the match. Runtime always receives an
    # explicit num_colors from the bridge, so this default is a parity anchor.
    num_colors: int = 32
    # Optional Munsell palette pair; ≤num_colors chips are selected and each
    # pixel is assigned one (same OKLab contract as linerate/pixelate).
    palette_oklab: list | None = None
    palette_rgb: list | None = None
    # How the ≤num_colors paints are chosen from the palette — SAME shared
    # reduction as pixelate/circulate: "top_n" (most-used chips) or "pam"
    # (weighted k-medoids). Coverage-based, no saliency bias.
    palette_restriction: str = "top_n"
    # Smallest inscribed-circle radius (source px) a region may keep; smaller
    # regions dissolve into their majority-neighbour paint before vectorising.
    # The Node bridge derives it from the "min paintable gap (mm)" dial.
    min_region_radius_px: float = 8.0
    # Work resolution (max edge px) the labelling runs at — form fidelity vs
    # latency. Node bridge maps the "Resolution" dial (low/medium/high) → 640/720/960.
    work_edge: int = 720


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
    # Dithering at the snap step. Dispatch lives in `cell_colors.py`:
    #   - "none"            → plain snap
    #   - "knoll_yliluoma"  → candidate-count N from `_strength_to_ky_n`
    #   - "floyd_steinberg" → scan-order error diffusion (ignores strength)
    #   - "texture"         → snap + blue-noise neighbour invasion at
    #                          `dither_strength` (was the separate
    #                          `texture_enabled` + `texture_strength`)
    # Pydantic's default-extra-ignore drops the fields silently when an
    # older Vercel revision sends the pre-unification shape, keeping the
    # rolling-deploy story safe.
    dither_mode: str = "knoll_yliluoma"
    dither_strength: float = 0.5
    # Snap-step distance metric (PR-H). Default `"oklab"` preserves
    # byte-identical pre-feature behaviour; `"ciede2000"` switches the
    # plain snap path to CIE Lab D65 + ΔE00. Pydantic's default-extra-
    # ignore keeps the rolling-deploy story safe (old Vercel revisions
    # omit the field → server defaults to oklab → no behaviour change).
    distance_metric: str = "oklab"
    # Palette-cap strategy (PR-I). Default `"top_n"` keeps the count-
    # based post-snap reduction. `"pam"` switches to a PRE-snap k-medoid
    # restriction (Kaufman & Rousseeuw 1987) — spread-optimal, more
    # expensive (<1s for typical sizes), uses the active `distance_metric`
    # for its distance matrix. Backward-compat via default-extra-ignore.
    palette_restriction: str = "top_n"


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
            dither_mode=request.dither_mode,
            dither_strength=request.dither_strength,
            distance_metric=request.distance_metric,
            palette_restriction=request.palette_restriction,
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
    # Dithering at the snap step — same contract as PixelateRequest.
    # Applied to OUTER ellipse colour; inner ellipse colour is derived
    # from the pre-snap means. `dither_mode == "texture"` runs the
    # blue-noise neighbour-invasion on the outer cells.
    dither_mode: str = "knoll_yliluoma"
    dither_strength: float = 0.5
    # Snap-step distance metric (PR-H) — same contract as PixelateRequest.
    distance_metric: str = "oklab"
    # Palette-cap strategy (PR-I) — same contract as PixelateRequest. PAM
    # restriction applies to OUTER ellipse colour only; inner ellipses
    # always snap against the FULL palette (sub-colour-filter math).
    palette_restriction: str = "top_n"


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
            dither_mode=request.dither_mode,
            dither_strength=request.dither_strength,
            distance_metric=request.distance_metric,
            palette_restriction=request.palette_restriction,
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


@app.post("/filters/linerate")
async def linerate_filter(request: LinerateRequest):
    """
    Linerate: perceptual paint-by-numbers (P³). L0 edge-preserving flatten →
    select ≤num_colors REAL paints from the fixed palette → per-pixel paint
    assignment via a convex Potts relaxation → paintability dissolve →
    shared-arc RDP+Chaikin smoothing → distance-transform numbers. Colour ==
    region, so adjacent regions always differ in colour; watertight by
    construction.
    """
    if request.line_thickness < 0.1 or request.line_thickness > 10:
        raise HTTPException(status_code=400, detail="line_thickness must be between 0.1 and 10")
    if request.flatten < 0 or request.flatten > 1:
        raise HTTPException(status_code=400, detail="flatten must be between 0 and 1")
    if request.detail < 0 or request.detail > 1:
        raise HTTPException(status_code=400, detail="detail must be between 0 and 1")
    if request.smoothness < 0 or request.smoothness > 1:
        raise HTTPException(status_code=400, detail="smoothness must be between 0 and 1")
    if request.radius < 0 or request.radius > 1:
        raise HTTPException(status_code=400, detail="radius must be between 0 and 1")
    if request.num_colors < 2 or request.num_colors > 560:
        raise HTTPException(status_code=400, detail="num_colors must be between 2 and 560")
    if request.palette_restriction not in ("top_n", "pam"):
        raise HTTPException(status_code=400, detail="palette_restriction must be 'top_n' or 'pam'")
    if request.work_edge < 256 or request.work_edge > 4096:
        raise HTTPException(status_code=400, detail="work_edge must be between 256 and 4096")
    if not request.image_url and not request.image_base64:
        raise HTTPException(status_code=400, detail="Either image_base64 or image_url must be provided")

    timer = PhaseTimer()
    try:
        # image_url (signed storage URL) is the default path — the input never rides
        # in the request body. Same bytes as the old base64 path → identical output.
        if request.image_url:
            img_bytes = await asyncio.to_thread(_download_image_bytes, request.image_url)
        else:
            img_bytes = base64.b64decode(request.image_base64)
        img = Image.open(io.BytesIO(img_bytes))
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        timer.mark("decode")

        svg_content, region_count, palette_indices_used = linerate_to_svg(
            img,
            line_thickness=request.line_thickness,
            flatten=request.flatten,
            detail=request.detail,
            smoothness=request.smoothness,
            num_colors=request.num_colors,
            min_radius=request.min_region_radius_px,
            width_radius_frac=request.radius,
            palette_oklab=request.palette_oklab,
            palette_rgb=request.palette_rgb,
            palette_restriction=request.palette_restriction,
            work_edge=request.work_edge,
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
