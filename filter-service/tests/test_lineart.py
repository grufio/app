"""Lineart endpoint smoke test (`app/main.py` -> `app/lineart.py`).

Deep geometry of the vtracer pipeline is out of scope here; this guards
the happy path end-to-end so a broken pipeline (import error, vtracer
contract change) is caught before the Cloud Run deploy.
"""
from __future__ import annotations

import base64
import io

import numpy as np
from PIL import Image


def _noise_png_b64(w: int = 24, h: int = 24) -> str:
    arr = np.random.default_rng(0).integers(0, 255, (h, w, 3), dtype=np.uint8)
    buf = io.BytesIO()
    Image.fromarray(arr, mode="RGB").save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def test_lineart_happy_path_returns_svg(client):
    res = client.post(
        "/filters/lineart",
        json={
            "image_base64": _noise_png_b64(),
            "line_thickness": 1.0,
            "blur_amount": 3,
            "smoothness": 0.6,
            "num_colors": 8,
        },
    )
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("application/json")
    assert "X-Region-Count" in res.headers
    body = res.json()
    assert body["svg"].lstrip().startswith("<?xml")
    assert "<svg" in body["svg"]
    assert "palette_indices_used" in body
    # No palette was sent in this request → no indices to report.
    assert body["palette_indices_used"] == []


def test_lineart_snaps_fills_to_palette(client):
    """When palette pair is provided, every emitted <path fill="..."> is
    a palette chip and the used-indices list reflects the chips that
    actually appear. Same single-step contract as pixelate / circulate."""
    palette_rgb = [
        [255, 0, 0],   # idx 0 — pure red
        [0, 255, 0],   # idx 1 — pure green
        [0, 0, 255],   # idx 2 — pure blue
        [255, 255, 0], # idx 3 — pure yellow
    ]
    # OKLab values for the palette (rough but deterministic — the
    # exact match is via nearest-neighbour, not equality).
    palette_oklab = [
        [0.628, 0.225, 0.126],   # red
        [0.866, -0.234, 0.179],  # green
        [0.452, -0.032, -0.312], # blue
        [0.968, -0.071, 0.198],  # yellow
    ]
    res = client.post(
        "/filters/lineart",
        json={
            "image_base64": _noise_png_b64(),
            "line_thickness": 1.0,
            "blur_amount": 3,
            "smoothness": 0.6,
            "num_colors": 8,
            "palette_oklab": palette_oklab,
            "palette_rgb": palette_rgb,
        },
    )
    assert res.status_code == 200
    body = res.json()
    used = body["palette_indices_used"]
    assert isinstance(used, list)
    assert all(isinstance(i, int) for i in used)
    assert used == sorted(set(used))  # deduped, ascending
    assert all(0 <= i < len(palette_rgb) for i in used)
    # Every path's fill is one of the chip RGBs (no median-cut leftover).
    import re as _re
    palette_hex = {f"#{r:02x}{g:02x}{b:02x}" for r, g, b in palette_rgb}
    fills = _re.findall(r'fill="(#[0-9a-fA-F]{6})"', body["svg"])
    assert fills, "expected at least one filled path"
    for hex_str in fills:
        assert hex_str.lower() in palette_hex


def test_lineart_emits_numbers_group_when_palette_set(client):
    """With a palette in play the SVG must contain `<g id="numbers">`
    with at least one `<text>` element — that's the paint-by-numbers
    label layer the desktop visibility toggle gates on."""
    palette_rgb = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]]
    palette_oklab = [
        [0.628, 0.225, 0.126],
        [0.866, -0.234, 0.179],
        [0.452, -0.032, -0.312],
        [0.968, -0.071, 0.198],
    ]
    res = client.post(
        "/filters/lineart",
        json={
            "image_base64": _noise_png_b64(64, 64),
            "line_thickness": 1.0,
            "blur_amount": 3,
            "smoothness": 0.6,
            "num_colors": 8,
            "palette_oklab": palette_oklab,
            "palette_rgb": palette_rgb,
        },
    )
    assert res.status_code == 200
    svg = res.json()["svg"]
    assert '<g id="numbers">' in svg
    assert "</g>" in svg


def test_lineart_no_numbers_group_without_palette(client):
    """Without a palette there's no label-map to drive numbers — the
    SVG should NOT contain `<g id="numbers">` at all (not an empty
    group)."""
    res = client.post(
        "/filters/lineart",
        json={
            "image_base64": _noise_png_b64(),
            "line_thickness": 1.0,
            "blur_amount": 3,
            "smoothness": 0.6,
            "num_colors": 8,
        },
    )
    assert res.status_code == 200
    svg = res.json()["svg"]
    assert '<g id="numbers">' not in svg


# --- palette-direct budget (the property median-cut could never guarantee) ----

_PALETTE_RGB = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]]
_PALETTE_OKLAB = [
    [0.628, 0.225, 0.126],   # red
    [0.866, -0.234, 0.179],  # green
    [0.452, -0.032, -0.312], # blue
    [0.968, -0.071, 0.198],  # yellow
]


def _lineart_fills(svg: str) -> list[str]:
    import re as _re
    return [h.lower() for h in _re.findall(r'fill="(#[0-9a-fA-F]{6})"', svg)]


def test_lineart_num_colors_is_a_real_palette_budget(client):
    """Palette-direct: with num_colors BELOW the palette size, the distinct fills
    must be ≤ num_colors AND all real palette chips. The paints are SELECTED from
    the palette before vtracer, so the budget is honoured — the old median-cut
    pre-quantise never gave this (its bins were arbitrary RGB, snapped post-hoc)."""
    res = client.post(
        "/filters/lineart",
        json={
            "image_base64": _noise_png_b64(48, 48),
            "line_thickness": 1.0, "blur_amount": 1, "smoothness": 0.6,
            "num_colors": 2,
            "palette_oklab": _PALETTE_OKLAB, "palette_rgb": _PALETTE_RGB,
        },
    )
    assert res.status_code == 200
    fills = _lineart_fills(res.json()["svg"])
    palette_hex = {f"#{r:02x}{g:02x}{b:02x}" for r, g, b in _PALETTE_RGB}
    assert fills, "expected filled paths"
    assert set(fills) <= palette_hex, "every fill must be a real palette chip"
    assert len(set(fills)) <= 2, f"budget of 2 exceeded: {set(fills)}"


def test_lineart_accepts_full_palette_budget(client):
    """A budget at/above the palette size is valid (no PIL 8-bit ceiling anymore)
    and just uses whatever chips the image needs — no crash, fills stay real."""
    res = client.post(
        "/filters/lineart",
        json={
            "image_base64": _noise_png_b64(48, 48),
            "line_thickness": 1.0, "blur_amount": 1, "smoothness": 0.6,
            "num_colors": 560,
            "palette_oklab": _PALETTE_OKLAB, "palette_rgb": _PALETTE_RGB,
        },
    )
    assert res.status_code == 200
    fills = _lineart_fills(res.json()["svg"])
    palette_hex = {f"#{r:02x}{g:02x}{b:02x}" for r, g, b in _PALETTE_RGB}
    assert fills and set(fills) <= palette_hex


def test_lineart_pam_selects_only_real_paints_and_is_deterministic(client):
    """The PAM restriction path selects real chips too, and the whole pipeline is
    deterministic (top_n/PAM have no RNG; the seed only drives subsampling, which
    is a no-op below the sample cap) → identical SVG on repeat."""
    body = {
        "image_base64": _noise_png_b64(48, 48),
        "line_thickness": 1.0, "blur_amount": 1, "smoothness": 0.6,
        "num_colors": 3, "palette_restriction": "pam",
        "palette_oklab": _PALETTE_OKLAB, "palette_rgb": _PALETTE_RGB,
    }
    r1 = client.post("/filters/lineart", json=body)
    r2 = client.post("/filters/lineart", json=body)
    assert r1.status_code == 200 and r2.status_code == 200
    palette_hex = {f"#{r:02x}{g:02x}{b:02x}" for r, g, b in _PALETTE_RGB}
    fills = _lineart_fills(r1.json()["svg"])
    assert fills and set(fills) <= palette_hex
    assert r1.json()["svg"] == r2.json()["svg"], "pipeline must be deterministic"
